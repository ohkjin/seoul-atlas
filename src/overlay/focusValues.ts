import type {Focus} from './Overlay';

// A field's values as plain numbers, converted once per dataset. Time fields hold
// strings like "2024-01-01 00:00:00"; converting all 9,150 rows took ~45ms, and doing it
// every playback frame for each card held the whole page to ~11fps.
const columnCache = new WeakMap<object, Map<number, Float64Array>>();
export function numericColumn(dataset: any, field: any): Float64Array {
  const dc = dataset.dataContainer;
  let byField = columnCache.get(dc);
  if (!byField) { byField = new Map(); columnCache.set(dc, byField); }
  let col = byField.get(field.fieldIdx);
  if (!col) {
    col = new Float64Array(dc.numRows());
    for (let r = 0; r < col.length; r++) {
      const v = field.valueAccessor({index: r});
      col[r] = v == null ? NaN : Number(v);
    }
    byField.set(field.fieldIdx, col);
  }
  return col;
}

// Range filters (time playback included) that kepler runs on the GPU never touch
// dataset.filteredIndex, so a value computed from it ignored the playing time window.
// Re-apply them here: one [column, lo, hi] check per active range filter on this dataset.
type Check = {col: Float64Array; field: any; lo: number; hi: number};
function rangeChecks(dataset: any, filters: any[]) {
  const checks: Check[] = [];
  for (const f of filters || []) {
    const at = (f.dataId || []).indexOf(dataset.id);
    if (at < 0 || !Array.isArray(f.value) || f.value.length !== 2 || typeof f.value[0] !== 'number') continue;
    const field = dataset.fields[f.fieldIdx?.[at]];
    if (field) checks.push({col: numericColumn(dataset, field), field, lo: f.value[0], hi: f.value[1]});
  }
  return checks;
}

// Rows sorted by a column, built once per dataset and field. With it, the rows inside a
// time window are one binary search away: the playing day of the per-dong daily data is
// 422 of its 154k rows, and scanning all of them every playback frame (for each card and
// the graph) dragged playback from 60 to ~25fps.
const orderCache = new WeakMap<object, Map<number, Uint32Array>>();
function rowsByValue(dataset: any, field: any, col: Float64Array): Uint32Array {
  const dc = dataset.dataContainer;
  let byField = orderCache.get(dc);
  if (!byField) { byField = new Map(); orderCache.set(dc, byField); }
  let order = byField.get(field.fieldIdx);
  if (!order) {
    order = Uint32Array.from({length: col.length}, (_, i) => i)
      .sort((a, b) => (Number.isNaN(col[a]) ? 1 : Number.isNaN(col[b]) ? -1 : col[a] - col[b]));
    byField.set(field.fieldIdx, order);
  }
  return order;
}
// The candidate rows for a set of checks: the first check's window when there is one
// (the rest are still tested per row), else every row `all` lists.
function* candidates(dataset: any, checks: Check[], all: ArrayLike<number> | null, n: number): Generator<number> {
  if (!checks.length) {
    if (all) for (let i = 0; i < all.length; i++) yield all[i];
    else for (let r = 0; r < n; r++) yield r;
    return;
  }
  const {col, field, lo, hi} = checks[0];
  const order = rowsByValue(dataset, field, col);
  let a = 0, b = order.length;
  while (a < b) { const m = (a + b) >> 1; if (col[order[m]] < lo) a = m + 1; else b = m; }
  for (let i = a; i < order.length && col[order[i]] <= hi; i++) yield order[i];
}

// Representative value of one field for the focused place, over the rows that pass
// kepler's current filters (so a time window moves the number). `mean` suits rates and
// indices; totals like population or sales must use `sum` instead.
export function focusValue(dataset: any, field: string, focus: Focus, how: 'mean' | 'sum' = 'mean', filters: any[] = []): number | null {
  if (!dataset) return null;
  const fIdx = dataset.fields.findIndex((f: any) => f.name === field);
  const guIdx = dataset.fields.findIndex((f: any) => f.name === 'gu_code');
  const dongIdx = dataset.fields.findIndex((f: any) => f.name === 'dong_code');
  if (fIdx < 0) return null;
  const dc = dataset.dataContainer;
  const checks = rangeChecks(dataset, filters);
  let total = 0, n = 0;
  rows: for (const r of candidates(dataset, checks, dataset.filteredIndex || [], dc.numRows())) {
    for (const c of checks) {
      const t = c.col[r];
      if (!(t >= c.lo && t <= c.hi)) continue rows;   // NaN fails both, so missing times drop out
    }
    if (focus.level === 'gu' && guIdx >= 0 && String(dc.valueAt(r, guIdx)) !== focus.gu.code) continue;
    if (focus.level === 'dong') {
      if (dongIdx >= 0) { if (String(dc.valueAt(r, dongIdx)) !== focus.dong.code) continue; }
      else if (guIdx >= 0 && String(dc.valueAt(r, guIdx)) !== focus.gu.code) continue;   // gu-only data: fall back to the gu
    }
    const v = dc.valueAt(r, fIdx);
    if (v == null || Number.isNaN(v)) continue;
    total += Number(v); n++;
  }
  if (!n) return null;
  return how === 'sum' ? total : total / n;
}

// [min, max] of a field over the whole dataset — the fixed range a legend is drawn
// against, so the scale does not jump while playback moves the time window.
export function extentOf(dataset: any, key: string): [number, number] | null {
  const field = dataset?.fields?.find((f: any) => f.name === key);
  if (!field) return null;
  const col = numericColumn(dataset, field);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < col.length; i++) {
    const x = col[i];
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return lo <= hi ? [lo, hi] : null;
}

// A field's distribution in equal bins over [lo, hi] — every row (a daily variable: the
// whole year), counted once per rows and kept.
const histCache = new WeakMap<object, Map<string, number[]>>();
export function histogramOf(dataset: any, key: string, extent: [number, number], bins = 24): number[] {
  const field = dataset?.fields?.find((f: any) => f.name === key);
  if (!field) return [];
  const dc = dataset.dataContainer;
  let byKey = histCache.get(dc);
  if (!byKey) { byKey = new Map(); histCache.set(dc, byKey); }
  const id = `${key}:${extent[0]}:${extent[1]}:${bins}`;
  let h = byKey.get(id);
  if (!h) {
    h = new Array(bins).fill(0);
    const col = numericColumn(dataset, field), span = extent[1] - extent[0] || 1;
    for (let i = 0; i < col.length; i++) {
      const v = col[i];
      if (Number.isFinite(v)) h[Math.min(bins - 1, Math.max(0, Math.floor(((v - extent[0]) / span) * bins)))]++;
    }
    byKey.set(id, h);
  }
  return h;
}

// Numbers for small, glanceable cards: 3 significant figures, and Korean-style
// magnitude words for the large sales totals (억 = 1e8, 조 = 1e12).
// Every place's value of one field — one per place, over the rows that pass the current
// filters (daily data: the playing day). Keyed by the place code in `keyField`.
export function valuesByPlace(dataset: any, field: string, keyField: string, filters: any[] = []): Map<string, number> {
  const out = new Map<string, number>();
  if (!dataset) return out;
  const f = dataset.fields.find((x: any) => x.name === field);
  const k = dataset.fields.findIndex((x: any) => x.name === keyField);
  if (!f || k < 0) return out;
  const col = numericColumn(dataset, f);
  const checks = rangeChecks(dataset, filters);
  const dc = dataset.dataContainer;
  rows: for (const r of candidates(dataset, checks, null, col.length)) {
    for (const c of checks) {
      const t = c.col[r];
      if (!(t >= c.lo && t <= c.hi)) continue rows;
    }
    if (Number.isFinite(col[r])) out.set(String(dc.valueAt(r, k)), col[r]);
  }
  return out;
}

// One value per day across the whole year for one place (or all of them): rows matched
// on `keyField` = `code`, combined per day by sum or mean. Ignores the time filter.
export function seriesByDay(dataset: any, field: string, keyField: string | null, code: string | null, how: 'mean' | 'sum') {
  const DAY = 86400000;
  if (!dataset) return null;
  const f = dataset.fields.find((x: any) => x.name === field);
  const d = dataset.fields.find((x: any) => x.name === 'date');
  const k = keyField ? dataset.fields.findIndex((x: any) => x.name === keyField) : -1;
  if (!f || !d) return null;
  const v = numericColumn(dataset, f), t = numericColumn(dataset, d);
  let lo = Infinity, hi = -Infinity;
  for (let r = 0; r < t.length; r++) { if (t[r] < lo) lo = t[r]; if (t[r] > hi) hi = t[r]; }
  const n = Math.round((hi - lo) / DAY) + 1;
  const sum = new Float64Array(n), cnt = new Uint32Array(n);
  const dc = dataset.dataContainer;
  for (let r = 0; r < v.length; r++) {
    if (code && k >= 0 && String(dc.valueAt(r, k)) !== code) continue;
    if (!Number.isFinite(v[r])) continue;
    const i = Math.round((t[r] - lo) / DAY);
    sum[i] += v[r]; cnt[i]++;
  }
  const vals = Array.from(sum, (s, i) => (cnt[i] ? (how === 'sum' ? s : s / cnt[i]) : NaN));
  return {start: lo, vals};
}

export function fmt(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)}조`;
  if (a >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
  if (a >= 1e4) return Math.round(v).toLocaleString('en-US');
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
