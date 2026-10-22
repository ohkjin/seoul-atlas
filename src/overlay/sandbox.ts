import {layerConfigChange, removeFilter, setMapControlVisibility, toggleSidePanel} from '@kepler.gl/actions';
import {addSyncedFilter, isOurFilterId} from './ourFilters';
import {hideLayer, isOurs} from './layers';
import {OUTLINE_LAYER_ID} from './outline';

type Dispatch = (a: any) => void;
type GetVisState = () => any;

// Sandbox: the map handed to plain kepler. The atlas drives kepler — it decides which
// layers exist, recolours some each day, owns the `time` filter — and kepler's own tools
// used on the same map would clash with those decisions. So they get a mode of their own:
// entering it pauses the atlas (Overlay gates its effects) and shows kepler's whole UI —
// its panel with Add data / Add layer / Filters, its time slider, its map controls — over
// the data already loaded. Leaving it parks what was made there — the user's layers hidden,
// their filters taken off (kept here; kepler 3.2.6 keeps filtering a filter marked
// enabled: false) — so the atlas comes back exactly as it was; entering again brings them
// back.

// kepler's map controls (all hidden in the atlas, see store.ts)
const CONTROLS = ['visibleLayers', 'mapLegend', 'toggle3d', 'splitMap', 'mapDraw', 'mapLocale'];
export const PLACE_FILTER = {gu: 'place:gu', dong: 'place:dong'};

type ParkedFilter = {id: string; dataId: string[]; name: string[]; value: unknown};
let parked: {layers: string[]; filters: ParkedFilter[]} = {layers: [], filters: []};

export function enterSandbox(dispatch: Dispatch, get: GetVisState) {
  for (const id of CONTROLS) dispatch(setMapControlVisibility(id as any, true));
  const vs = get();
  for (const id of parked.layers) {
    const l = vs.layers.find((x: any) => x.id === id);
    if (l) dispatch(layerConfigChange(l, {isVisible: true, hidden: false} as any));
  }
  for (const f of parked.filters) {
    if (!get().filters.some((x: any) => x.id === f.id)) addSyncedFilter(dispatch, get, f.id, f.dataId, f.name, f.value);
  }
  parked = {layers: [], filters: []};
  dispatch(toggleSidePanel('layer'));
}

export function leaveSandbox(dispatch: Dispatch, get: GetVisState) {
  const vs = get();
  // what the user made here: layers that are not the atlas's, filters other than time
  const mine = vs.layers.filter((l: any) => !isOurs(l.id) && l.id !== OUTLINE_LAYER_ID && !l.id.startsWith('halo:') && l.config.isVisible);
  parked.layers = mine.map((l: any) => l.id);
  mine.forEach((l: any) => hideLayer(dispatch, l));
  const theirs = get().filters.map((f: any, i: number) => ({f, i})).filter(({f}: any) => f.id !== 'time' && !isOurFilterId(f.id));
  parked.filters = theirs.map(({f}: any) => ({id: f.id, dataId: [...f.dataId], name: [...f.name], value: f.value}));
  // from the last, so the indices of the rest hold
  for (const {i} of [...theirs].reverse()) dispatch(removeFilter(i));
  for (const id of CONTROLS) dispatch(setMapControlVisibility(id as any, false));
  dispatch(toggleSidePanel(null as any));
  // the atlas's playback needs its time filter: put it back if it was removed here
  const after = get();
  if (!after.filters.some((f: any) => f.id === 'time')) {
    // the atlas's playback starts as a one-day window (mapConfig.ts)
    addSyncedFilter(dispatch, get, 'time', ['gu_daily', 'dong_daily'], ['date', 'date'], [Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 2) - 1]);
  }
}

// "Filter by district" / "by neighbourhood": one kepler filter on the place name across
// every dataset that has it — kepler's own panel only offers that for time filters. It
// starts empty (filters nothing) and is then set in kepler's Filters tab, which opens.
export function addPlaceFilter(dispatch: Dispatch, get: GetVisState, level: 'gu' | 'dong') {
  const vs = get();
  const id = PLACE_FILTER[level];
  if (!vs.filters.some((f: any) => f.id === id)) {
    const field = level === 'gu' ? 'gu_name' : 'dong_name';
    const ids = ['dong', 'gu', 'gu_daily', 'dong_daily']
      .filter((d) => vs.datasets[d]?.fields.some((f: any) => f.name === field));
    addSyncedFilter(dispatch, get, id, ids, ids.map(() => field));
  }
  dispatch(toggleSidePanel('filter'));
}
