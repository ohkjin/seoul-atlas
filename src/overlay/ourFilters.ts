import {addFilter, removeFilter, setFilter} from '@kepler.gl/actions';

type Dispatch = (a: any) => void;
type GetVisState = () => any;

// The atlas's own filters: a value range on each selected variable ("only places where
// RHSI is below −0.2"). Each is a kepler range filter, `ours:<key>`, on every dataset that
// carries that variable — its areas, its daily rows, the pair's copy — so the map, and
// every panel that reads values through the filters (focusValues), follow. Range filters
// on numbers run on the GPU, so a filter costs nothing per playback step. The daily grid
// on the areas has no daily column to filter; its recolouring leaves out the places the
// filter removed (pair.ts). In Aggregate a daily variable's areas are its own table, each place's
// combined value (timeModes.ts aggregateTable), and so is its range: the filter is on that table.
export type Ranges = Record<string, [number, number]>;
export const ourFilterId = (key: string) => `ours:${key}`;
export const isOurFilterId = (id: string) => id.startsWith('ours:');
const DATASETS = ['dong', 'gu', 'dong_daily', 'gu_daily', 'dong_pair', 'gu_pair', 'dong_cells', 'gu_cells'];
// What the panels' memos watch besides the day: every filter but the playing day's — the
// atlas's own and any added in kepler's Filters tab, which the panels read too.
export const filtersKey = (filters: any[]) =>
  (filters || []).filter((f: any) => f.id !== 'time').map((f: any) => `${f.id}:${f.name}:${f.value}`).join('|');

// A filter on several datasets, built one dataset at a time with its field set in the
// same action: kepler filtered in between with no field name and logged an error.
export function addSyncedFilter(dispatch: Dispatch, get: GetVisState, id: string, dataIds: string[], fields: string[], value?: unknown) {
  const ids = dataIds.filter((d) => get().datasets[d]);
  if (!ids.length) return;
  dispatch(addFilter(ids[0], id));
  const idx = get().filters.findIndex((f: any) => f.id === id);
  if (idx < 0) return;
  ids.forEach((d, i) => dispatch(setFilter(idx, ['dataId', 'name'] as any, [d, fields[dataIds.indexOf(d)]] as any, i)));
  if (value !== undefined) dispatch(setFilter(idx, 'value', value));
}

const AGG_DATASETS = ['dong_agg', 'gu_agg'];
const datasetsWith = (vs: any, key: string, aggregate: boolean) => {
  const has = (d: string) => vs.datasets[d]?.fields.some((f: any) => f.name === key);
  const agg = aggregate ? AGG_DATASETS.filter(has) : [];
  return agg.length ? agg : DATASETS.filter(has);
};

// Brings kepler's filters in line with the ranges: adds, moves, or drops `ours:` filters.
// A filter whose datasets changed (a pair rebuilt, the daily rows arrived) is rebuilt.
export function syncOurFilters(dispatch: Dispatch, get: GetVisState, ranges: Ranges, aggregate = false) {
  const vs = get();
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  for (let i = vs.filters.length - 1; i >= 0; i--) {
    const f = vs.filters[i];
    if (!isOurFilterId(f.id)) continue;
    const key = f.id.slice(5);
    if (!ranges[key] || !same(f.dataId, datasetsWith(vs, key, aggregate))) dispatch(removeFilter(i));
  }
  for (const [key, range] of Object.entries(ranges)) {
    const now = get();
    const idx = now.filters.findIndex((f: any) => f.id === ourFilterId(key));
    if (idx < 0) {
      const ids = datasetsWith(now, key, aggregate);
      if (ids.length) addSyncedFilter(dispatch, get, ourFilterId(key), ids, ids.map(() => key), range);
    } else {
      const v = now.filters[idx].value;
      if (!Array.isArray(v) || v[0] !== range[0] || v[1] !== range[1]) dispatch(setFilter(idx, 'value', range));
    }
  }
}
