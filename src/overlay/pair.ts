import {addDataToMap, layerVisConfigChange, layerVisualChannelConfigChange} from '@kepler.gl/actions';
import {AREA_STROKE, VAR_BY_KEY, heightScaleFor, paletteRange, type Variable} from '../data/catalog';
import {valuesByPlace} from './focusValues';
import {displayNameOf, type UhusData} from '../data/uhus';
import type {Grain} from './layers';

// Two neighbourhood variables on one map. kepler has no bivariate map, so each pair gets
// its own small dataset — the places, both variables, and a `bivariate` class — and one
// polygon layer on it, `bi:A:B`.
//   2D: a bivariate choropleth — each variable cut into thirds, 3×3 = nine colours.
//   3D: the same layer stands up — colour from A (kepler's default ramp), height from B.

type Dispatch = (a: any) => void;

export const PAIR_FIELD = 'bivariate';
export const pairIdOf = (a: string, b: string) => `bi:${a}:${b}`;
// bc:A:B is a daily pair in 3D: bubbles for two daily variables, raised areas for a daily
// and a static one (A the daily colour, B the static height)
export const columnPairIdOf = (a: string, b: string) => `bc:${a}:${b}`;
// hb:A:B is two static variables in 3D: the cells, colour A, height B
export const cellPairIdOf = (a: string, b: string) => `hb:${a}:${b}`;
// hc:D:S is the raised static × daily pair seen from afar: on the cells
export const cellMixedIdOf = (d: string, s: string) => `hc:${d}:${s}`;
export const pairKeysOf = (id: string) =>
  (['bi:', 'bc:', 'hb:', 'hc:'].some((p) => id.startsWith(p)) ? id.slice(3).split(':') : null);
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
      return {name: f.name, type: f.type, format: f.format ?? '', analyzerType: f.analyzerType, displayName: displayNameOf(f.name)};
    }),
    {name: PAIR_FIELD, type: 'string', format: '', analyzerType: 'STRING', displayName: `Class (${a.short} × ${b.short})`}
  ];
  const dataId = pairDataIdOf(grain);
  // The layer travels inside addDataToMap's config: kepler adds the dataset as a task, so
  // a separate addLayer right after found no dataset yet and was dropped.
  const layer = {
    id: pairIdOf(a.key, b.key), type: 'geojson',
    config: {dataId, label: `${a.short} × ${b.short}`, columns: {geojson: '_geojson'}, isVisible: true,
      visConfig: {opacity: 0.85, filled: true, ...AREA_STROKE,
        elevationScale: 5, ...pairVisConfig(a, b, is3d)}},
    visualChannels: {...pairColourChannel(a, is3d), heightField: {name: b.key, type: 'real'}, heightScale: 'linear'}
  };
  dispatch(addDataToMap({
    datasets: [{info: {id: dataId, label: `${a.short} × ${b.short}`}, data: {fields, rows}}],
    options: {centerMap: false, keepExistingConfig: true, autoCreateLayers: false},
    config: {version: 'v1', config: {visState: {layers: [layer]}}}
  } as any));
}

// The blue–red ramp of the daily bubbles: two hues only, blue for low and red for high,
// in four steps (quartiles) — six-hue ramps read as a rainbow. Taken from kepler's
// ColorBrewer RdBu, skipping its near-black ends and near-white middle, which vanish or
// glare on the dark basemap.
function blueRed() {
  const r = paletteRange('RdBu', 8, true);
  return r && {...r, name: 'RdBu · 4 steps', colors: [1, 2, 5, 6].map((i) => r.colors[i])};
}

// A pair with a daily variable in 2D — two daily ones, or a static and a daily one: the
// same bivariate grid as the static pair, on the places' own areas, the colours of the
// playing day. kepler cannot colour a polygon by another
// dataset's row, and rebuilding a 422-area dataset every day cost 60–140 ms a step; so the
// layer sits on the static areas (dong / gu), coloured by place code through a colour map
// (customOrdinal), and only that map is rewritten each day — about 1 ms
// (recolourDailyPair). Each variable is cut into thirds of that day's places, as the
// static pair is: the grid says where it is hotter or wetter than elsewhere today. Cut by
// the whole year instead (the basis of the single daily colours), a day's weather — about
// the same all over Seoul — put every place in one third, and the map showed two colours.
// a place with no value — or one the atlas's filter took out — recedes to near the basemap
const NO_DATA = '#202329';
const codeFieldOf = (areaId: string) => (areaId.startsWith('dong') ? 'dong_code' : 'gu_code');
const dailyRange = (colorMap: [string, string][]) =>
  ({name: 'Seoul bivariate · daily', type: 'custom', category: 'Custom', colors: [...BIVARIATE.flat(), NO_DATA], colorMap});
export function dailyPairConfig(a: Variable, b: Variable, areaId: string) {
  const key = codeFieldOf(areaId);
  return {
    id: pairIdOf(a.key, b.key), type: 'geojson',
    config: {dataId: areaId, label: `${a.short} × ${b.short}`, columns: {geojson: '_geojson'}, isVisible: true,
      colorField: {name: key, type: 'string'}, colorScale: 'customOrdinal',
      visConfig: {opacity: 0.85, filled: true, ...AREA_STROKE,
        colorRange: dailyRange([])}},
    visualChannels: {colorField: {name: key, type: 'string'}, colorScale: 'customOrdinal'}
  };
}

// A pair layer drawn as the 3×3 grid (2D): the static pair's class field or the daily
// pair's place-code colour map — both customOrdinal. The daily one sits on the areas.
export const isBivariateLayer = (layer: any) => !!layer && ['bi:', 'hb:', 'hc:'].some((p) => layer.id.startsWith(p))
  && layer.config.colorScale === 'customOrdinal';
export const isDailyBivariate = (layer: any) => isBivariateLayer(layer) && !isPairDataId(layer.config.dataId);
// Its colours by place code, for the graph's dots and the legend's ringed cell.
export const dailyColoursOf = (layer: any) =>
  isDailyBivariate(layer) ? new Map<string, string>(layer.config.visConfig?.colorRange?.colorMap || []) : null;
// Which cell of the grid a colour is.
export function cellOf(colour: string | undefined): [number, number] | null {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (BIVARIATE[i][j] === colour) return [i, j];
  return null;
}

// Colours the pair layers that change with the day — the 2D grid and the 3D bc: layers —
// for the playing day: each place's colour from that day's values (the rows the time
// filter lets through; a static variable's own values). Skipped when nothing changed.
export function recolourDailyPair(dispatch: Dispatch, visState: any) {
  for (const layer of visState?.layers || []) {
    if (!layer.config.isVisible) continue;
    // the 3×3 grid: on the areas in 2D (bi:), on the cells from afar in 3D (hb:, hc:)
    const grid = (layer.id.startsWith('bi:') && (layer.config.dataId === 'dong' || layer.config.dataId === 'gu'))
      || layer.id.startsWith('hb:') || layer.id.startsWith('hc:');
    // bc: bubbles and the raised pair: coloured by the daily one's quartiles
    const bubbles = layer.id.startsWith('bc:');
    if (!grid && !bubbles) continue;
    const keys = pairKeysOf(layer.id);
    if (!keys) continue;
    const [a, b] = keys.map((k: string) => VAR_BY_KEY[k]);
    const byDong = layer.config.dataId.startsWith('dong');
    const area = visState.datasets[byDong ? 'dong' : 'gu'];
    const sourceOf = (x: Variable) => visState.datasets[x.dataset === 'dong' ? (byDong ? 'dong' : 'gu')
      : x.dataset === 'dong_daily' ? (byDong ? 'dong_daily' : 'gu_daily') : x.dataset];
    const key = byDong ? 'dong_code' : 'gu_code';
    const valuesOf = (x: Variable) => {
      const ds = sourceOf(x);
      return ds ? valuesByPlace(ds, x.key, key, x.dataset === 'dong' ? [] : visState.filters) : null;
    };
    const va = valuesOf(a), vb = grid ? valuesOf(b) : null;
    if (!area || !va || (grid && !vb)) continue;
    const ci = area.fields.findIndex((f: any) => f.name === key);
    const codes: string[] = [];
    for (let r = 0; r < area.dataContainer.numRows(); r++) codes.push(String(area.dataContainer.valueAt(r, ci)));
    let colorMap: [string, string][];
    let range: any;
    if (grid) {
      const ta = thirdsOf([...va.values()]), tb = thirdsOf([...vb!.values()]);
      colorMap = codes.map((code) => {
        const i = ta.level(va.get(code)), j = tb.level(vb!.get(code));
        return [code, i == null || j == null ? NO_DATA : BIVARIATE[i][j]];
      });
      range = dailyRange(colorMap);
    } else {
      // A's quartiles among the day's places
      const ramp = bubbleRange([]).colors;
      const sorted = [...va.values()].sort((p, q) => p - q);
      const cuts = ramp.slice(1).map((_: string, i: number) => sorted[Math.min(sorted.length - 1, Math.floor(((i + 1) / ramp.length) * sorted.length))]);
      colorMap = codes.map((code) => {
        const v = va.get(code);
        if (v == null) return [code, NO_DATA];
        let k = 0;
        while (k < cuts.length && v >= cuts[k]) k++;
        return [code, ramp[k]];
      });
      range = bubbleRange(colorMap);
    }
    const own = visState.datasets[layer.config.dataId];
    if (layer.config.colorField?.name !== key || layer.config.colorScale !== 'customOrdinal') {
      const field = own?.fields.find((f: any) => f.name === key);
      if (field) dispatch(layerVisualChannelConfigChange(layer, {colorField: field, colorScale: 'customOrdinal'} as any, 'color', {colorRange: range} as any));
      continue;
    }
    const old: [string, string][] = layer.config.visConfig?.colorRange?.colorMap || [];
    if (old.length === colorMap.length && old.every((c, i) => c[0] === colorMap[i][0] && c[1] === colorMap[i][1])) continue;
    dispatch(layerVisConfigChange(layer, {colorRange: range} as any));
  }
}

// Two daily variables in 3D: bubbles on the daily rows — colour from A, in blue–red
// quartiles of the playing day's places (so a day's weather, about the same all over
// Seoul, still shows where it is higher), recoloured by place code like the grid; size
// from B over its whole year. No rim: on bubbles this small a white ring outweighed the
// colour. Radii are kepler's zoom-14 units: ~1.5–6 px for 422 neighbourhoods (larger ran
// together into one blob), ~6–22 px for 25 districts.
const bubbleRange = (colorMap: [string, string][]) => {
  const r = blueRed();
  return {name: 'RdBu · 4 steps · daily', type: 'custom', category: 'Custom', colors: r ? r.colors : [], colorMap};
};
export function dailyColumnPairConfig(a: Variable, b: Variable, dataId: string) {
  const key = codeFieldOf(dataId);
  return {
    id: columnPairIdOf(a.key, b.key), type: 'point',
    config: {dataId, label: `${a.short} × ${b.short}`, columns: {lat: 'lat', lng: 'lng'}, isVisible: true,
      colorField: {name: key, type: 'string'}, colorScale: 'customOrdinal',
      visConfig: {opacity: 0.9, radiusRange: dataId === 'dong_daily' ? [6, 26] : [24, 90], outline: false, filled: true,
        colorRange: bubbleRange([])}},
    visualChannels: {colorField: {name: key, type: 'string'}, colorScale: 'customOrdinal',
      sizeField: {name: b.key, type: 'real'}, sizeScale: heightScaleFor(b)}
  };
}

// A static and a daily variable in 3D: the places' areas raised by the static one and
// coloured by the daily one. kepler raises a polygon only by a field of its own dataset,
// so the daily variable cannot be the height without rebuilding the areas every day; it
// takes the colour instead — the day's blue–red quartiles, recoloured by place code like
// the bubbles.
export function dailyRaisedPairConfig(daily: Variable, stat: Variable, areaId: string) {
  const key = codeFieldOf(areaId);
  return {
    id: columnPairIdOf(daily.key, stat.key), type: 'geojson',
    config: {dataId: areaId, label: `${daily.short} × ${stat.short}`, columns: {geojson: '_geojson'}, isVisible: true,
      colorField: {name: key, type: 'string'}, colorScale: 'customOrdinal',
      visConfig: {opacity: 0.85, filled: true, ...AREA_STROKE,
        enable3d: true, elevationScale: 5, colorRange: bubbleRange([])}},
    visualChannels: {colorField: {name: key, type: 'string'}, colorScale: 'customOrdinal',
      heightField: {name: stat.key, type: 'real'}, heightScale: 'linear'}
  };
}

// Two variables in 3D seen from afar: the places' cells (uhus.ts cellsOf) lying flat on
// the ground, each in its place's colour of the 3×3 grid — the 2D map's colours as a hex
// grid. Coloured by place code like the daily grid (recolourDailyPair); two static
// variables (hb:) keep their colours, one daily (hc:) changes them day by day.
function cellGridConfig(id: string, a: Variable, b: Variable, cellsId: string) {
  const key = codeFieldOf(cellsId);
  return {
    id, type: 'hexagonId',
    config: {dataId: cellsId, label: `${a.short} × ${b.short}`, columns: {hex_id: 'h3'}, isVisible: true,
      colorField: {name: key, type: 'string'}, colorScale: 'customOrdinal',
      visConfig: {opacity: 0.9, coverage: 0.72, enable3d: false, colorRange: dailyRange([])}},
    visualChannels: {colorField: {name: key, type: 'string'}, colorScale: 'customOrdinal'}
  };
}
export const dailyRaisedCellsConfig = (daily: Variable, stat: Variable, cellsId: string) =>
  cellGridConfig(cellMixedIdOf(daily.key, stat.key), daily, stat, cellsId);
export const cellPairConfig = (a: Variable, b: Variable, cellsId: string) =>
  cellGridConfig(cellPairIdOf(a.key, b.key), a, b, cellsId);

// The parts of the pair layer that change with the mode.
export const pairVisConfig = (a: Variable, b: Variable, is3d: boolean) =>
  ({enable3d: is3d, colorRange: is3d ? paletteRange('Global Warming') : bivariateRange(a, b)});
export const pairColourChannel = (a: Variable, is3d: boolean) => is3d
  ? {colorField: {name: a.key, type: 'real'}, colorScale: 'quantile'}
  : {colorField: {name: PAIR_FIELD, type: 'string'}, colorScale: 'customOrdinal'};
