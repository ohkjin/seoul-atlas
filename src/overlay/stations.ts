import {addDataToMap, addLayer, layerConfigChange, replaceDataInMap} from '@kepler.gl/actions';
import {VAR_BY_KEY, type Variable} from '../data/catalog';
import {VALUE_COLOURS, combineFor, type Combine, type ShowAs, type TimeView} from './timeModes';
import type {Period} from './TimeRuler';

// The places behind a dong's count — subway stations, bus stops, bike docks — as circles sized by their
// own value (mockups/point-layers: option A, "Show as" on the time card). Each file
// (scripts/public-data-lib.mjs writeStations) holds every station, busiest first, with its 2024 totals,
// and the day-by-day values of the busiest 1,100: those are sized; the rest show as faint specks.
//   pts_daily  one row per sized station and day — on the time filter, Timeline sizes them by the day
//   pts_sized  one row per sized station — Aggregate sizes them by the ruler's period combined
//   pts        every station — the specks
// Circle size runs over the whole table (kepler's size domain), so it means the same on every day.
type Kind = 'subway' | 'bus' | 'bike';
const POINTS: Record<string, {kind: Kind; field: string; what: string}> = {
  subway_board: {kind: 'subway', field: 'board', what: 'stations'}, subway_alight: {kind: 'subway', field: 'alight', what: 'stations'},
  bus_board: {kind: 'bus', field: 'board', what: 'stops'}, bus_alight: {kind: 'bus', field: 'alight', what: 'stops'},
  bike_rentals: {kind: 'bike', field: 'rentals', what: 'docks'},
};
export const pointsOf = (key: string) => POINTS[key];
export const pointIdOf = (key: string) => `p:${key}`;
export const specksIdOf = (key: string) => `s:${key}`;
export const POINT_DATA = ['pts_daily', 'pts_sized', 'pts'];

type StationFile = {fields: string[]; stations: {sid: string; name: string; lng: number; lat: number; total: Record<string, number>}[];
  daily: Record<string, number[][]>};
const files = new Map<Kind, Promise<StationFile>>();
export function loadStations(kind: Kind): Promise<StationFile> {
  if (!files.has(kind)) {
    files.set(kind, fetch(`/data/opendata/stations_${kind}.json`).then((r) => {
      if (!r.ok) throw new Error(`stations_${kind}: HTTP ${r.status}`);
      return r.json();
    }));
  }
  return files.get(kind)!;
}

// How many are sized: all that have days (the busiest 1,100), or the busiest share
export function sizedCount(file: StationFile, field: string, show: ShowAs, pct: number) {
  const withDays = file.daily[field]?.length ?? 0;
  return show === 'all' ? withDays : Math.min(withDays, Math.max(1, Math.ceil((file.stations.length * pct) / 100)));
}

const DAY = 86400000, DAY0 = Date.UTC(2024, 0, 1);
const dateOf = (i: number) => `${new Date(DAY0 + i * DAY).toISOString().slice(0, 10)} 00:00:00`;
const F = (name: string, type: string, analyzerType: string) => ({name, type, format: type === 'timestamp' ? 'YYYY-M-D H:m:s' : '', analyzerType});
const BASE = [F('sid', 'string', 'STRING'), F('name', 'string', 'STRING'), F('lat', 'real', 'FLOAT'), F('lng', 'real', 'FLOAT')];

function combined(vals: number[], from: number, to: number, combine: Combine, x: Variable) {
  const vs = vals.slice(from, to + 1).filter(Number.isFinite);
  if (!vs.length) return null;
  const c = combineFor(x, combine);
  if (c === 'sum') return vs.reduce((a, b) => a + b, 0);
  if (c === 'mean' || c === 'hotmild') return vs.reduce((a, b) => a + b, 0) / vs.length;   // (no hot / mild flags per station)
  if (c === 'max') return Math.max(...vs);
  const s = [...vs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// The three tables for a variable, shown as `show` (the busiest `pct` %), the period combined for Aggregate.
export function stationTables(file: StationFile, x: Variable, show: ShowAs, pct: number, period: Period, combine: Combine) {
  const {field} = POINTS[x.key];
  const n = sizedCount(file, field, show, pct);
  const daily = file.daily[field] || [];
  const from = Math.max(0, Math.round((period[0] - DAY0) / DAY)), to = Math.min(365, Math.round((period[1] - DAY0) / DAY) - 1);
  const dailyRows: any[][] = [];
  const sizedRows: any[][] = [];
  const meanOf = (vals: number[], a: number, b: number) => {
    const vs = vals.slice(a, b + 1).filter(Number.isFinite);
    return vs.length ? vs.reduce((p, q) => p + q, 0) / vs.length : null;
  };
  for (let i = 0; i < n; i++) {
    const s = file.stations[i];
    // its usual day: the mean over the period (vs its avg in Timeline), and over the whole year (Aggregate)
    const usual = meanOf(daily[i], from, to), year = meanOf(daily[i], 0, daily[i].length - 1);
    daily[i].forEach((v, d) => { if (d >= from && d <= to) dailyRows.push([s.sid, s.name, s.lat, s.lng, dateOf(d), v, usual]); });
    sizedRows.push([s.sid, s.name, s.lat, s.lng, combined(daily[i], from, to, combine, x), usual, year]);
  }
  const allRows = file.stations.map((s) => [s.sid, s.name, s.lat, s.lng, s.total[field]]);
  const value = F(x.key, 'real', 'FLOAT');
  return {
    pts_daily: {fields: [...BASE, F('date', 'timestamp', 'DATETIME'), value, F('usual', 'real', 'FLOAT')], rows: dailyRows},
    pts_sized: {fields: [...BASE, value, F('usual', 'real', 'FLOAT'), F('year_usual', 'real', 'FLOAT')], rows: sizedRows},
    pts: {fields: [...BASE, value], rows: allRows},
    sized: n, total: file.stations.length,
  };
}

// Put the tables on the map: added the first time, replaced after (the layers on them stay).
const LABEL: Record<string, string> = {pts_daily: 'Stations · daily', pts_sized: 'Stations · period', pts: 'Stations · all'};
export function putStationTables(dispatch: (a: any) => void, visState: any, tables: ReturnType<typeof stationTables>) {
  for (const id of POINT_DATA) {
    const data = (tables as any)[id];
    const info = {id, label: LABEL[id]};
    if (visState.datasets[id]) {
      dispatch(replaceDataInMap({datasetToReplaceId: id, datasetToUse: {info, data} as any,
        options: {keepExistingConfig: true, centerMap: false, autoCreateLayers: false}} as any) as any);
    } else {
      dispatch(addDataToMap({datasets: [{info, data}], options: {centerMap: false, keepExistingConfig: true, autoCreateLayers: false}} as any));
    }
  }
}

// The sized circles (p:key): one teal (option A), area by the value; vs Avg recolours them by station (timeModes.ts).
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
export const POINT_TEAL = hexRgb(VALUE_COLOURS.pointActual);
export function pointLayerConfig(x: Variable, dataId: string) {
  return {
    id: pointIdOf(x.key), type: 'point',
    config: {dataId, label: `${x.short} · ${POINTS[x.key].what}`, columns: {lat: 'lat', lng: 'lng'}, isVisible: true,
      color: POINT_TEAL,
      visConfig: {opacity: 0.62, filled: true, outline: false, radiusRange: [2, 64]}},
    visualChannels: {sizeField: {name: x.key, type: 'real'}, sizeScale: 'sqrt'}
  };
}
// the rest of them as faint specks: where the network is, not how busy
function specksConfig(x: Variable) {
  return {
    id: specksIdOf(x.key), type: 'point',
    config: {dataId: 'pts', label: `${x.short} · other ${POINTS[x.key].what}`, columns: {lat: 'lat', lng: 'lng'}, isVisible: true,
      color: POINT_TEAL, visConfig: {radius: 3, opacity: 0.28, filled: true, outline: false}},
    visualChannels: {}
  };
}

// Specks for the variable whose points are shown (Busiest with the rest faint, or All when some have no days);
// every other s: layer off.
export function syncSpecks(dispatch: (a: any) => void, visState: any, key: string | null, view: TimeView) {
  const file = key ? POINTS[key] : null;
  const want = key && file && visState.datasets.pts && (view.show === 'top'
    || (view.show === 'all' && visState.datasets.pts.dataContainer.numRows() > (visState.datasets.pts_sized?.dataContainer.numRows() ?? 0)))
    ? specksIdOf(key) : null;
  for (const l of visState.layers || []) {
    if (!l.id.startsWith('s:')) continue;
    const on = l.id === want;
    if (!!l.config.isVisible !== on || !!l.config.hidden === on) dispatch(layerConfigChange(l, {isVisible: on, hidden: !on} as any));
  }
  if (want && !visState.layers.some((l: any) => l.id === want)) dispatch(addLayer(specksConfig(VAR_BY_KEY[key!]) as any, 'pts'));
}

// The size legend: three circles, their values from the layer's size domain (sqrt: area by value).
export function sizeLegendOf(layer: any): {r: number; v: number}[] | null {
  const dom = layer?.config?.sizeDomain;
  const range = layer?.config?.visConfig?.radiusRange;
  if (!Array.isArray(dom) || !Array.isArray(range) || !(dom[1] > 0)) return null;
  const max = dom[1];
  // on screen, kepler's zoom-14 radius units are about a quarter of a pixel at the city view
  const px = (v: number) => Math.max(1, (range[0] + (range[1] - range[0]) * Math.sqrt(v / max)) / 4);
  return [max / 16, max / 4, max].map((v) => ({v, r: px(v)}));
}
