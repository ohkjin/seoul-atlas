import {layerConfigChange, layerVisualChannelConfigChange, layerVisConfigChange} from '@kepler.gl/actions';
import {VAR_BY_KEY, AREA_STROKE, aggIdOf, colorRangeFor, isDivergingRamp, varOfLayerId, type Variable} from '../data/catalog';
import {numericColumn, valuesByPlace} from './focusValues';
import type {Grain} from './layers';
import type {Period} from './TimeRuler';
import type {Focus} from './Overlay';

// How a daily variable is drawn, chosen on the time card's folder tabs (mockups/time-modes/card.png):
//   Timeline  — day by day, as the time card plays it;
//   Aggregate — the ruler's period combined into one value per place (Combine), on the areas.
// and its Value: Actual (the number itself, cut over the whole period — kepler's year-wide quantiles)
// or vs Avg (above or below the average of the places, on the same day or over all days of the period).
// vs Avg is the default: on one day the weather is about the same all over Seoul, and cut over the
// whole year a day's map was one colour (mockups/time-modes/basis.png, option C).
export type TimeMode = 'timeline' | 'aggregate';
export type ValueMode = 'actual' | 'avg';
export type AvgBase = 'same' | 'all';
export type Combine = 'sum' | 'mean' | 'median' | 'max' | 'hotmild';
// Show as (data with points: stations, stops, docks — stations.ts): every one sized; the busiest pct %
// sized and the rest faint; the busiest only; or summed by dong, as every other variable is drawn.
export type ShowAs = 'all' | 'top' | 'only' | 'dong';
export type TimeView = {mode: TimeMode; value: ValueMode; base: AvgBase; combine: Combine; show: ShowAs; pct: number};
export const DEFAULT_TIME_VIEW: TimeView = {mode: 'timeline', value: 'avg', base: 'same', combine: 'sum', show: 'all', pct: 5};

type Dispatch = (a: any) => void;
const DAY = 86400000;

// ── The colours of the time card's Value, in one place ─────────────────────────────────────────
// (A variable's own Actual colours are catalog.ts colorRangeFor: THEME_PALETTE / OWN_PALETTE.)
// vs Avg runs seven steps, low → high, with a quiet middle. Temperature-like variables (a blue-to-red
// ramp of their own) keep blue below / red above; every other one runs from dark slate below, through
// grey about average, to bright teal above — the look of mockups/time-modes/basis.png option C, where
// the higher, the brighter on the dark basemap. Station circles use the same steps, and one teal for Actual.
export const VALUE_COLOURS = {
  warmCold: ['#2166ac', '#4393c3', '#92c5de', '#b9bec7', '#f4a582', '#d6604d', '#b2182b'],
  belowAbove: ['#2f3649', '#465169', '#67728b', '#8b929e', '#6cc4bb', '#8fe3dc', '#cdf7f2'],
  pointActual: '#8fe3dc',
  noData: '#202329',
};
// a station against its own usual day: below half · … · about usual (±10%) · … · above double
export const OWN_AVG_EDGES = [0.5, 0.7, 0.9, 1.1, 1.4, 2].map(Math.log2);
const NO_DATA = VALUE_COLOURS.noData;
export const divergingOf = (x: Variable) => (isDivergingRamp(x) ? VALUE_COLOURS.warmCold : VALUE_COLOURS.belowAbove);

// A place against an average: a total as how many times the average (sales, boardings — places differ
// by orders of magnitude; kept as log2, so half and double are as far from it), a level as a plain
// difference (°C, %).
export const isRatio = (x: Variable) => x.how === 'sum';
const log2ratio = (v: number, avg: number) => (avg > 0 ? Math.log2(Math.max(v, avg / 64) / avg) : NaN);
export const deviation = (x: Variable, v: number, avg: number) => (isRatio(x) ? log2ratio(v, avg) : v - avg);
// The step edges: ±s, ±s/2, ±s/6 around zero, s the 90th percentile of the distances — so the
// darkest steps hold the most unusual tenth of the places, whatever the variable.
function edgesOf(devs: number[]): number[] {
  const a = devs.filter(Number.isFinite).map(Math.abs).sort((p, q) => p - q);
  const s = a.length ? a[Math.min(a.length - 1, Math.floor(0.9 * a.length))] || a[a.length - 1] || 1 : 1;
  return [-s, -s / 2, -s / 6, s / 6, s / 2, s];
}
const stepOf = (d: number, edges: number[]) => { let k = 0; while (k < edges.length && d >= edges[k]) k++; return k; };
// ±s as the card's legend reads it: a share in %, a level in the variable's unit
export const formatDeviation = (x: Variable, d: number) =>
  (isRatio(x) ? `×${2 ** d >= 1 ? (2 ** d).toFixed(1) : (2 ** d).toFixed(2)}` : `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)}${x.unit === 'ratio' ? '' : ` ${x.unit}`}`);

// What the left panel's card shows for a layer this module colours: its legend's colours and ends,
// and (Aggregate) the place's combined value. Set on each recolour.
// (placeValues: for points, the dongs' or districts' own combined values — what a place's card reads)
export type Legend = {colors: string[]; ends: [string, string]; note: string; values?: Map<string, number>; sumUp?: boolean;
  placeValues?: Map<string, number>};
const legends = new Map<string, Legend>();
export const legendOf = (layerId: string) => legends.get(layerId);
// The period combined for the focused place, from a daily table (the time card's value, any layer)
export function aggregateFor(x: Variable, ds: any, period: Period, combine: Combine, focus: Focus): number | null {
  if (!ds) return null;
  const c = combineFor(x, combine);
  const values = combineByPlace(x, ds, period, c);
  const code = ds.id.startsWith('dong') ? (focus.level === 'dong' ? focus.dong.code : null) : focus.level !== 'seoul' ? focus.gu.code : null;
  if (code) return values.get(code) ?? null;
  const prefix = focus.level === 'seoul' ? '' : focus.gu.code;
  const vs = [...values].filter(([k, v]) => k.startsWith(prefix) && Number.isFinite(v)).map(([, v]) => v);
  return vs.length ? (isRatio(x) && c !== 'hotmild' ? sum(vs) : mean(vs)) : null;
}

// An aggregate's value for the focused place: its own, or its district's / Seoul's — the sum of its
// places for a total (a dong code begins with its district's), else their mean.
export function aggregateAt(layerId: string, focus: Focus): number | null {
  const lg = legends.get(layerId);
  const values = lg?.placeValues ?? lg?.values;
  if (!values?.size) return null;
  const own = focus.level === 'dong' ? values.get(focus.dong.code) ?? values.get(focus.gu.code)
    : focus.level === 'gu' ? values.get(focus.gu.code) : undefined;
  if (own != null) return own;
  const prefix = focus.level === 'seoul' ? '' : focus.gu.code;
  const vs = [...values].filter(([c, v]) => c.startsWith(prefix) && Number.isFinite(v)).map(([, v]) => v);
  if (!vs.length) return null;
  return lg?.sumUp ? sum(vs) : mean(vs);
}

// (a station's id begins with its dong's code: stations.ts)
const codeFieldOf = (dataId: string) => (dataId.startsWith('pts') ? 'sid' : dataId.startsWith('dong') ? 'dong_code' : 'gu_code');
const rangeOf = (name: string, colors: string[], colorMap: [string, string][]) =>
  ({name, type: 'custom', category: 'Custom', colors: [...colors, NO_DATA], colorMap});

// ── All rows of a daily table inside the period, per field: cached by table and period ─────────
type Rows = {code: string[]; day: Int32Array; v: Float64Array; hot?: Float64Array; mild?: Float64Array};
const rowCache = new WeakMap<object, Map<string, Rows>>();
function rowsOf(ds: any, key: string, period: Period): Rows | null {
  const dc = ds?.dataContainer;
  if (!dc) return null;
  let byKey = rowCache.get(dc);
  if (!byKey) { byKey = new Map(); rowCache.set(dc, byKey); }
  const id = `${key}|${period[0]}|${period[1]}`;
  const hit = byKey.get(id);
  if (hit) return hit;
  const field = (n: string) => ds.fields.find((f: any) => f.name === n);
  const fv = field(key), fd = field('date'), ci = ds.fields.findIndex((f: any) => f.name === codeFieldOf(ds.id));
  if (!fv || !fd || ci < 0) return null;
  const t = numericColumn(ds, fd), v = numericColumn(ds, fv);
  const fh = field('is_hot'), fm = field('is_mild');
  const h = fh ? numericColumn(ds, fh) : null, m = fm ? numericColumn(ds, fm) : null;
  const keep: number[] = [];
  for (let r = 0; r < t.length; r++) if (t[r] >= period[0] && t[r] < period[1] && Number.isFinite(v[r])) keep.push(r);
  const rows: Rows = {code: keep.map((r) => String(dc.valueAt(r, ci))), day: Int32Array.from(keep, (r) => Math.floor(t[r] / DAY)),
    v: Float64Array.from(keep, (r) => v[r]), hot: h ? Float64Array.from(keep, (r) => h[r]) : undefined,
    mild: m ? Float64Array.from(keep, (r) => m[r]) : undefined};
  byKey.set(id, rows);
  return rows;
}

// The averages vs Avg compares with, and its step edges — fixed for the whole period, so a colour
// means the same on every day it plays: the mean of each day's places (same day), or of every
// place-day (all days).
// The places averaged: all of Seoul, or the focused district's dongs (a dong code begins with its
// district's). Under Gu detail a district is one place, so the average stays Seoul's.
export type Scope = {prefix: string; name: string};
export const SEOUL_SCOPE: Scope = {prefix: '', name: 'Seoul'};
type Basis = {dayMean: Map<number, number>; allMean: number; edges: Record<AvgBase, number[]>};
const basisCache = new WeakMap<Rows, Map<string, Basis>>();
function basisOf(x: Variable, rows: Rows, scope: Scope): Basis {
  let byVar = basisCache.get(rows);
  if (!byVar) { byVar = new Map(); basisCache.set(rows, byVar); }
  const hit = byVar.get(`${x.key}|${scope.prefix}`);
  if (hit) return hit;
  const sum = new Map<number, number>(), cnt = new Map<number, number>();
  let all = 0, n = 0;
  for (let i = 0; i < rows.v.length; i++) {
    if (!rows.code[i].startsWith(scope.prefix)) continue;
    n++;
    sum.set(rows.day[i], (sum.get(rows.day[i]) ?? 0) + rows.v[i]);
    cnt.set(rows.day[i], (cnt.get(rows.day[i]) ?? 0) + 1);
    all += rows.v[i];
  }
  const dayMean = new Map([...sum].map(([d, s]) => [d, s / cnt.get(d)!]));
  const allMean = n ? all / n : NaN;
  const same: number[] = [], every: number[] = [];
  for (let i = 0; i < rows.v.length; i += Math.max(1, Math.floor(n / 40000))) {
    if (!rows.code[i].startsWith(scope.prefix)) continue;
    same.push(deviation(x, rows.v[i], dayMean.get(rows.day[i])!));
    every.push(deviation(x, rows.v[i], allMean));
  }
  const basis = {dayMean, allMean, edges: {same: edgesOf(same), all: edgesOf(every)}};
  byVar.set(`${x.key}|${scope.prefix}`, basis);
  return basis;
}

// Every value of a daily variable in the period (the pair's cuts over all days, pair.ts)
export const periodValues = (ds: any, key: string, period: Period) => rowsOf(ds, key, period)?.v ?? null;

// ── Timeline: the single daily layers (points v:, columns c:) coloured for the playing day ────────
// Actual puts back kepler's own colouring by the field (year-wide quantiles). vs Avg colours each
// place by code, from that day's value against the average — the way the daily pair's grid is
// recoloured (pair.ts recolourDailyPair): only a colour map changes each day, about a millisecond.
export function recolourTimeline(dispatch: Dispatch, visState: any, view: TimeView, period: Period, scope: Scope = SEOUL_SCOPE) {
  for (const layer of visState?.layers || []) {
    if (!layer.config.isVisible || !['v:', 'c:', 'p:'].some((p) => layer.id.startsWith(p))) continue;
    const x = varOfLayerId(layer.id);
    const ds = visState.datasets[layer.config.dataId];
    if (!x || !ds || !(ds.id === 'gu_daily' || ds.id === 'dong_daily' || ds.id === 'pts_daily')) continue;
    const code = codeFieldOf(ds.id);
    if (layer.id.startsWith('p:')) { recolourPointsTimeline(dispatch, visState, layer, x, ds, view); continue; }
    if (view.value === 'actual') {
      legends.delete(layer.id);
      if (layer.config.colorField?.name === x.key) continue;
      const field = ds.fields.find((f: any) => f.name === x.key);
      if (field) dispatch(layerVisualChannelConfigChange(layer, {colorField: field, colorScale: 'quantile'} as any, 'color',
        {colorRange: colorRangeFor(x)} as any));
      continue;
    }
    const rows = rowsOf(ds, x.key, period);
    if (!rows) continue;
    const basis = basisOf(x, rows, scope);
    const time = (visState.filters || []).filter((f: any) => f.id === 'time');
    const today = valuesByPlace(ds, x.key, code, time);
    const t0 = time[0]?.value?.[0];
    const day = typeof t0 === 'number' ? Math.ceil(t0 / DAY) : NaN;
    const inScope = [...today].filter(([c]) => c.startsWith(scope.prefix)).map(([, v]) => v);
    const avg = view.base === 'same' ? (basis.dayMean.get(day) ?? mean(inScope)) : basis.allMean;
    const edges = basis.edges[view.base];
    const colors = divergingOf(x);
    const colorMap: [string, string][] = [...codesOf(visState, ds.id)].map((c) => {
      const v = today.get(c);
      const d = v == null ? NaN : deviation(x, v, avg);
      return [c, Number.isFinite(d) ? colors[stepOf(d, edges)] : NO_DATA];
    });
    legends.set(layer.id, {colors, ends: [formatDeviation(x, edges[0]), formatDeviation(x, edges[5])],
      note: `vs ${scope.name} avg · ${view.base === 'same' ? 'same day' : 'all days'}`});
    applyColorMap(dispatch, layer, ds, code, rangeOf(`${x.short} · vs avg`, colors, colorMap));
  }
}

// ── Aggregate: the period combined per place, on the areas (g:key) ───────────────────────────
// One value per place from the daily rows inside the ruler's period. Hot ÷ Mild is the RHSI-style
// ratio: the mean on the study's hot days over the mean on its mild days (the rows' own flags).
export function combineByPlace(x: Variable, ds: any, period: Period, combine: Combine): Map<string, number> {
  const rows = rowsOf(ds, x.key, period);
  const out = new Map<string, number>();
  if (!rows) return out;
  const by = new Map<string, number[]>();
  const hot = new Map<string, [number, number]>(), mild = new Map<string, [number, number]>();
  for (let i = 0; i < rows.v.length; i++) {
    const c = rows.code[i];
    if (combine === 'hotmild') {
      const add = (m: Map<string, [number, number]>) => { const a = m.get(c) ?? [0, 0]; a[0] += rows.v[i]; a[1]++; m.set(c, a); };
      if ((rows.hot?.[i] ?? 0) >= 0.5) add(hot);
      if ((rows.mild?.[i] ?? 0) >= 0.5) add(mild);
      continue;
    }
    (by.get(c) ?? by.set(c, []).get(c)!).push(rows.v[i]);
  }
  if (combine === 'hotmild') {
    for (const [c, [hs, hn]] of hot) {
      const m = mild.get(c);
      if (m && m[1] && hn && m[0]) out.set(c, (hs / hn) / (m[0] / m[1]));
    }
    return out;
  }
  for (const [c, vs] of by) {
    const sorted = combine === 'median' ? [...vs].sort((p, q) => p - q) : vs;
    out.set(c, combine === 'sum' ? sum(vs) : combine === 'mean' ? sum(vs) / vs.length
      : combine === 'max' ? Math.max(...vs) : sorted[Math.floor(sorted.length / 2)]);
  }
  return out;
}

// The areas with each aggregated variable's period value as a column — the aggregate layers' own table
// (dong_agg / gu_agg), so the map's tooltip reads the combined value. Built from the area table
// ({fields, rows}, uhus.ts) the way the pair's table is (pair.ts addPair).
const AGG_KEEP = {dong: ['_geojson', 'gu_name', 'gu_code', 'dong_name', 'dong_code'], gu: ['_geojson', 'gu_name', 'gu_code']};
export const aggDataIdOf = (grain: Grain) => `${grain}_agg`;
export function aggregateTable(src: {fields: any[]; rows: any[][]}, grain: Grain, columns: [Variable, Map<string, number>][]) {
  const idx = (n: string) => src.fields.findIndex((f: any) => f.name === n);
  const keep = AGG_KEEP[grain].map(idx);
  const ci = idx(grain === 'dong' ? 'dong_code' : 'gu_code');
  const fields = [...keep.map((i) => ({...src.fields[i]})),
    ...columns.map(([x]) => ({name: x.key, type: 'real', format: '', analyzerType: 'FLOAT', displayName: `${x.short} · period`}))];
  const rows = src.rows.map((r) => [...keep.map((i) => r[i]), ...columns.map(([, m]) => m.get(String(r[ci])) ?? null)]);
  return {fields, rows};
}

// The area layer Aggregate draws for a daily variable: the places' own areas, coloured by code.
export function aggregateConfigFor(x: Variable, areaId: string) {
  const code = codeFieldOf(areaId);
  return {
    id: aggIdOf(x.key), type: 'geojson',
    config: {dataId: areaId, label: `${x.short} · aggregate`, columns: {geojson: '_geojson'}, isVisible: true,
      colorField: {name: code, type: 'string'}, colorScale: 'customOrdinal',
      visConfig: {opacity: 0.85, filled: true, ...AREA_STROKE, colorRange: rangeOf(`${x.short} · aggregate`, colorRangeFor(x)?.colors ?? [], [])}},
    visualChannels: {colorField: {name: code, type: 'string'}, colorScale: 'customOrdinal'}
  };
}

export const COMBINE_LABEL: Record<Combine, string> = {sum: 'Sum', mean: 'Mean', median: 'Median', max: 'Max', hotmild: 'Hot ÷ Mild'};
// A level (°C, %) does not add up over days: Sum stands for Mean there.
export const canSum = (x: Variable) => x.how === 'sum';
export const combineFor = (x: Variable, c: Combine): Combine => (c === 'sum' && !canSum(x) ? 'mean' : c);

export function recolourAggregate(dispatch: Dispatch, visState: any, view: TimeView, period: Period, grain: Grain,
  scope: Scope = SEOUL_SCOPE) {
  recolourPointsAggregate(dispatch, visState, view, scope, period, grain);
  for (const layer of visState?.layers || []) {
    if (!layer.config.isVisible || !layer.id.startsWith('g:')) continue;
    const x = VAR_BY_KEY[layer.id.slice(2)];
    const daily = visState.datasets[grain === 'dong' && x?.dataset === 'dong_daily' && visState.datasets.dong_daily ? 'dong_daily' : 'gu_daily'];
    const areas = visState.datasets[layer.config.dataId];
    if (!x || !daily || !areas) continue;
    const code = codeFieldOf(areas.id);
    const combine = combineFor(x, view.combine);
    const values = combineByPlace(x, daily, period, combine);
    const vs = [...values.values()];
    let colors: string[], stepFor: (v: number) => number, ends: [string, string], note: string;
    // Hot ÷ Mild is a ratio already: vs Avg compares it with 1's neighbours the same way
    const ratioView = combine === 'hotmild';
    if (view.value === 'avg') {
      const avg = mean([...values].filter(([c]) => c.startsWith(scope.prefix)).map(([, v]) => v));
      const dev = (v: number) => (ratioView || isRatio(x) ? log2ratio(v, avg) : v - avg);
      const edges = edgesOf([...values].filter(([c]) => c.startsWith(scope.prefix)).map(([, v]) => dev(v)));
      colors = divergingOf(x);
      stepFor = (v) => stepOf(dev(v), edges);
      const fmtD = (d: number) => (ratioView ? formatDeviation({...x, how: 'sum'}, d) : formatDeviation(x, d));
      ends = [fmtD(edges[0]), fmtD(edges[5])];
      note = `vs ${scope.name} avg`;
    } else {
      colors = colorRangeFor(x)?.colors ?? [];
      const sorted = [...vs].sort((p, q) => p - q);
      const cuts = colors.slice(1).map((_, i) => sorted[Math.min(sorted.length - 1, Math.floor(((i + 1) / colors.length) * sorted.length))]);
      stepFor = (v) => stepOf(v, cuts);
      const f = (v: number | undefined) => (v == null ? '' : ratioView ? v.toFixed(2) : Math.abs(v) >= 1e4 ? `${(v / 1e4).toFixed(0)}만` : v.toFixed(1));
      ends = [f(sorted[0]), f(sorted[sorted.length - 1])];
      note = COMBINE_LABEL[combine];
    }
    const colorMap: [string, string][] = [...codesOf(visState, areas.id)].map((c) => {
      const v = values.get(c);
      return [c, v == null || !Number.isFinite(v) ? NO_DATA : colors[stepFor(v)] ?? NO_DATA];
    });
    legends.set(layer.id, {colors, ends, note, values, sumUp: isRatio(x) && combine !== 'hotmild'});
    applyColorMap(dispatch, layer, areas, code, rangeOf(`${x.short} · aggregate`, colors, colorMap));
  }
}

// Aggregate points (p:key on pts_sized): each station's period value against the stations in view.
function recolourPointsAggregate(dispatch: Dispatch, visState: any, view: TimeView, scope: Scope, period: Period, grain: Grain) {
  for (const layer of visState?.layers || []) {
    if (!layer.config.isVisible || !layer.id.startsWith('p:') || layer.config.dataId !== 'pts_sized') continue;
    const x = VAR_BY_KEY[layer.id.slice(2)];
    const ds = visState.datasets.pts_sized;
    if (!x || !ds) continue;
    const values = valuesByPlace(ds, x.key, 'sid');
    // the places' own totals for the cards: every station counted, not only the sized ones
    const daily = visState.datasets[grain === 'dong' && visState.datasets.dong_daily ? 'dong_daily' : 'gu_daily'];
    const placeValues = daily ? combineByPlace(x, daily, period, combineFor(x, view.combine)) : undefined;
    const sumUp = isRatio(x) && view.combine !== 'hotmild';
    if (view.value === 'actual') { legends.set(layer.id, {colors: [], ends: ['', ''], note: COMBINE_LABEL[combineFor(x, view.combine)], values, placeValues, sumUp}); plainPoints(dispatch, layer); continue; }
    // vs its avg: the period's usual day against the station's own usual day over the year
    // (summer against its year, say) — the circle stays the period's value
    const usual = valuesByPlace(ds, 'usual', 'sid'), year = valuesByPlace(ds, 'year_usual', 'sid');
    const colors = VALUE_COLOURS.belowAbove;
    const colorMap: [string, string][] = [...codesOf(visState, 'pts_sized')].map((c) => {
      const u = usual.get(c), y = year.get(c);
      const d = u != null && y ? Math.log2(Math.max(u, y / 64) / y) : NaN;
      return [c, Number.isFinite(d) ? colors[stepOf(d, OWN_AVG_EDGES)] : NO_DATA];
    });
    void scope;
    legends.set(layer.id, {colors, ends: ['×0.5', '×2'], note: 'vs its own year', values, placeValues, sumUp});
    applyColorMap(dispatch, layer, ds, 'sid', rangeOf(`${x.short} · vs avg`, colors, colorMap));
  }
}
// Timeline points (p:key on pts_daily). Actual: one teal, the circle that day's value (option A).
// vs its avg: the circle the station's usual day (fixed, so the map holds still), its colour that day
// against it — below half dark, about usual grey, above double bright (mockups/time-modes/basis.png C).
// Against the other stations instead, a big station is always "above": the colour only repeated the size.
function recolourPointsTimeline(dispatch: Dispatch, visState: any, layer: any, x: Variable, ds: any, view: TimeView) {
  if (view.value === 'actual') {
    legends.delete(layer.id);
    sizeBy(dispatch, layer, ds, x.key);
    plainPoints(dispatch, layer);
    return;
  }
  sizeBy(dispatch, layer, ds, 'usual');
  const time = (visState.filters || []).filter((f: any) => f.id === 'time');
  const today = valuesByPlace(ds, x.key, 'sid', time), usual = valuesByPlace(ds, 'usual', 'sid', time);
  const colors = VALUE_COLOURS.belowAbove;
  const colorMap: [string, string][] = [...codesOf(visState, ds.id)].map((c) => {
    const v = today.get(c), u = usual.get(c);
    const d = v != null && u ? Math.log2(Math.max(v, u / 64) / u) : NaN;
    return [c, Number.isFinite(d) ? colors[stepOf(d, OWN_AVG_EDGES)] : NO_DATA];
  });
  legends.set(layer.id, {colors, ends: ['×0.5', '×2'], note: 'vs its own avg'});
  applyColorMap(dispatch, layer, ds, 'sid', rangeOf(`${x.short} · vs its avg`, colors, colorMap));
}
function sizeBy(dispatch: Dispatch, layer: any, ds: any, name: string) {
  if (layer.config.sizeField?.name === name) return;
  const field = ds.fields.find((f: any) => f.name === name);
  if (field) dispatch(layerVisualChannelConfigChange(layer, {sizeField: field} as any, 'size'));
}
// Actual for points: one teal, no colour field
function plainPoints(dispatch: Dispatch, layer: any) {
  if (!layer.config.colorField) return;
  const hex = VALUE_COLOURS.pointActual;
  dispatch(layerVisualChannelConfigChange(layer, {colorField: null} as any, 'color'));
  dispatch(layerConfigChange(layer, {color: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))} as any));
}

// ── shared ───────────────────────────────────────────────────────────────────────────────
const sum = (vs: number[]) => vs.reduce((a, b) => a + b, 0);
const mean = (vs: number[]) => (vs.length ? sum(vs) / vs.length : NaN);
// every place code of a table, in row order (each code once)
const codeCache = new WeakMap<object, Set<string>>();
function codesOf(visState: any, dataId: string): Set<string> {
  const ds = visState.datasets[dataId];
  const dc = ds?.dataContainer;
  if (!dc) return new Set();
  let codes = codeCache.get(dc);
  if (!codes) {
    const ci = ds.fields.findIndex((f: any) => f.name === codeFieldOf(dataId));
    codes = new Set();
    for (let r = 0; r < dc.numRows(); r++) codes.add(String(dc.valueAt(r, ci)));
    codeCache.set(dc, codes);
  }
  return codes;
}
// Colour by code through a colour map: switched over once, then only the map is rewritten — and
// not even that when it has not changed.
function applyColorMap(dispatch: Dispatch, layer: any, ds: any, code: string, range: any) {
  if (layer.config.colorField?.name !== code || layer.config.colorScale !== 'customOrdinal') {
    const field = ds.fields.find((f: any) => f.name === code);
    if (field) dispatch(layerVisualChannelConfigChange(layer, {colorField: field, colorScale: 'customOrdinal'} as any, 'color', {colorRange: range} as any));
    return;
  }
  const old: [string, string][] = layer.config.visConfig?.colorRange?.colorMap || [];
  const next: [string, string][] = range.colorMap;
  if (old.length === next.length && old.every((c, i) => c[0] === next[i][0] && c[1] === next[i][1])) return;
  dispatch(layerVisConfigChange(layer, {colorRange: range} as any));
}
