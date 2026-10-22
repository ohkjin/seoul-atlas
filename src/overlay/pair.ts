import {addDataToMap} from '@kepler.gl/actions';
import {heightScaleFor, paletteRange, type Variable} from '../data/catalog';
import type {UhusData} from '../data/uhus';
import type {Grain} from './layers';

// Two neighbourhood variables on one map. kepler has no bivariate map, so each pair gets
// its own small dataset — the places, both variables, and a `bivariate` class — and one
// polygon layer on it, `bi:A:B`.
//   2D: a bivariate choropleth — each variable cut into thirds, 3×3 = nine colours.
//   3D: the same layer stands up — colour from A (kepler's default ramp), height from B.

type Dispatch = (a: any) => void;

export const PAIR_FIELD = 'bivariate';
export const pairIdOf = (a: string, b: string) => `bi:${a}:${b}`;
// bc:A:B is the daily pair drawn as columns in 3D
export const columnPairIdOf = (a: string, b: string) => `bc:${a}:${b}`;
export const pairKeysOf = (id: string) => (id.startsWith('bi:') || id.startsWith('bc:') ? id.slice(3).split(':') : null);
export const pairDataIdOf = (grain: Grain) => `${grain}_pair`;
export const isPairDataId = (id: string) => id.endsWith('_pair');

// Mixed like light on the dark basemap: A adds rose, B adds teal, both high meet in a
// pale lilac; low-low stays a dim slate that still separates from the basemap. Kept a
// step below full saturation so 400 neighbourhoods read as a map, not a neon quilt.
// BIVARIATE[a][b], a and b = 0 low · 1 mid · 2 high.
export const BIVARIATE = [
  ['#2e3140', '#2f6e78', '#35b0b5'],
  ['#7b3f6c', '#6e6f95', '#7dbccc'],
  ['#c8467f', '#cf7fae', '#ecdcf2']
];
const LEVEL = ['low', 'mid', 'high'];
const classLabel = (a: Variable, b: Variable, la: number, lb: number) =>
  `${a.short} ${LEVEL[la]} · ${b.short} ${LEVEL[lb]}`;

function bivariateRange(a: Variable, b: Variable) {
  const colorMap: [string, string][] = [];
  for (let la = 0; la < 3; la++) for (let lb = 0; lb < 3; lb++) colorMap.push([classLabel(a, b, la, lb), BIVARIATE[la][lb]]);
  return {name: 'Seoul bivariate', type: 'custom', category: 'Custom', colors: colorMap.map((c) => c[1]), colorMap};
}

// Thirds of the places in this grain, so each class row and column holds about as many.
// The 2D graph draws the same cuts, so it shares this.
export function thirdsOf(values: unknown[]) {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).sort((p, q) => p - q);
  const at = (q: number) => v[Math.min(v.length - 1, Math.floor(q * v.length))];
  const [t1, t2] = [at(1 / 3), at(2 / 3)];
  const level = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? (x < t1 ? 0 : x < t2 ? 1 : 2) : null);
  return {t1, t2, level};
}
const thirds = (values: unknown[]) => thirdsOf(values).level;

const KEEP = {dong: ['_geojson', 'gu_name', 'gu_code', 'dong_name', 'dong_code'], gu: ['_geojson', 'gu_name', 'gu_code']};

export function addPair(dispatch: Dispatch, data: UhusData, grain: Grain, a: Variable, b: Variable, is3d: boolean) {
  const src: any = grain === 'dong' ? data.dong : data.gu;
  const idx = (name: string) => src.fields.findIndex((f: any) => f.name === name);
  const cols = [...KEEP[grain], a.key, b.key];
  const ia = idx(a.key), ib = idx(b.key);
  const la = thirds(src.rows.map((r: any[]) => r[ia])), lb = thirds(src.rows.map((r: any[]) => r[ib]));
  const rows = src.rows.map((r: any[]) => {
    const ca = la(r[ia]), cb = lb(r[ib]);
    return [...cols.map((c) => r[idx(c)]), ca == null || cb == null ? null : classLabel(a, b, ca, cb)];
  });
  const fields = [
    ...cols.map((c) => {
      const f = src.fields[idx(c)];
      return {name: f.name, type: f.type, format: f.format ?? '', analyzerType: f.analyzerType};
    }),
    {name: PAIR_FIELD, type: 'string', format: '', analyzerType: 'STRING'}
  ];
  const dataId = pairDataIdOf(grain);
  // The layer travels inside addDataToMap's config: kepler adds the dataset as a task, so
  // a separate addLayer right after found no dataset yet and was dropped.
  const layer = {
    id: pairIdOf(a.key, b.key), type: 'geojson',
    config: {dataId, label: `${a.short} × ${b.short}`, columns: {geojson: '_geojson'}, isVisible: true,
      visConfig: {opacity: 0.85, filled: true, stroked: true, strokeColor: [14, 16, 20], strokeOpacity: 0.7, thickness: 0.5,
        elevationScale: 5, ...pairVisConfig(a, b, is3d)}},
    visualChannels: {...pairColourChannel(a, is3d), heightField: {name: b.key, type: 'real'}, heightScale: 'linear'}
  };
  dispatch(addDataToMap({
    datasets: [{info: {id: dataId, label: `${a.short} × ${b.short}`}, data: {fields, rows}}],
    options: {centerMap: false, keepExistingConfig: true, autoCreateLayers: false},
    config: {version: 'v1', config: {visState: {layers: [layer]}}}
  } as any));
}

// Two daily variables on the same rows share one point layer: colour from A, size from B.
// The colour is two hues only, blue for low and red for high, in four steps (quartiles):
// small circles must still read by colour alone, a one-hue ramp washed out at that size,
// and six-hue ramps read as a rainbow. Taken from kepler's ColorBrewer RdBu, skipping its
// near-black ends and near-white middle, which vanish or glare on the dark basemap.
// Radii are kepler's zoom-14 units: ~6–22 px for 25 districts, ~1.5–6 px for 422
// neighbourhoods (larger ran together into one blob over the city).
function blueRed() {
  const r = paletteRange('RdBu', 8, true);
  return r && {...r, name: 'RdBu · 4 steps', colors: [1, 2, 5, 6].map((i) => r.colors[i])};
}
export function dailyPairConfig(a: Variable, b: Variable, dataId: string) {
  const range = blueRed();
  return {
    id: pairIdOf(a.key, b.key), type: 'point',
    config: {dataId, label: `${a.short} × ${b.short}`, columns: {lat: 'lat', lng: 'lng'}, isVisible: true,
      // no rim: on circles this small a white ring outweighed the colour inside it
      visConfig: {opacity: 0.9, radiusRange: dataId === 'dong_daily' ? [6, 26] : [24, 90], outline: false, filled: true,
        ...(range ? {colorRange: range} : {})}},
    // quantile: sales are heavily skewed — equal-width bins left almost every place in the lowest
    visualChannels: {colorField: {name: a.key, type: 'real'}, colorScale: 'quantile',
      sizeField: {name: b.key, type: 'real'}, sizeScale: 'sqrt'}
  };
}

// The daily pair in 3D: hexagonal columns, colour from A (the same blue–red quartiles as
// the circles), height from B.
export function dailyColumnPairConfig(a: Variable, b: Variable, dataId: string) {
  const range = blueRed();
  return {
    id: columnPairIdOf(a.key, b.key), type: 'hexagonId',
    config: {dataId, label: `${a.short} × ${b.short}`, columns: {hex_id: 'h3'}, isVisible: true,
      visConfig: {opacity: 0.9, coverage: 0.9, enable3d: true, elevationScale: 5, ...(range ? {colorRange: range} : {})}},
    visualChannels: {colorField: {name: a.key, type: 'real'}, colorScale: 'quantile',
      sizeField: {name: b.key, type: 'real'}, sizeScale: heightScaleFor(b)}
  };
}

// The parts of the pair layer that change with the mode.
export const pairVisConfig = (a: Variable, b: Variable, is3d: boolean) =>
  ({enable3d: is3d, colorRange: is3d ? paletteRange('Global Warming') : bivariateRange(a, b)});
export const pairColourChannel = (a: Variable, is3d: boolean) => is3d
  ? {colorField: {name: a.key, type: 'real'}, colorScale: 'quantile'}
  : {colorField: {name: PAIR_FIELD, type: 'string'}, colorScale: 'customOrdinal'};
