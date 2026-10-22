import {addLayer, interactionConfigChange, layerConfigChange, layerVisConfigChange, layerVisualChannelConfigChange,
  removeDataset, reorderLayer, toggleLayerForMap, toggleSidePanel, toggleSplitMap} from '@kepler.gl/actions';
import {VAR_BY_KEY, columnConfigFor, columnIdOf, isTemporal, layerConfigFor, layerIdOf, varOfLayerId,
  type Variable} from '../data/catalog';
import type {UhusData} from '../data/uhus';
import {PAIR_FIELD, addPair, columnPairIdOf, dailyColumnPairConfig, dailyPairConfig, isPairDataId, pairColourChannel, pairDataIdOf, pairIdOf, pairKeysOf,
  pairVisConfig} from './pair';

// The selection is what the map is about: at most two variables, in the order they were
// linked (🔗 in the drawer). Linking a third lets the first go, so the map always shows
// the latest two. Two is what kepler can show side by side (its split map has exactly
// two halves) and what one layer can carry readably (the bivariate grid, colour + height).
export const MAX_SELECTED = 2;
export function nextSelection(selection: string[], key: string): string[] {
  if (selection.includes(key)) return selection.filter((k) => k !== key);
  return [...selection, key].slice(-MAX_SELECTED);
}

// Map detail: neighbourhood variables can be drawn per dong or rolled up per district —
// the static ones on the dong / gu areas, the daily sales on dong_daily / gu_daily points.
// Daily weather exists per district only, so it is unaffected.
export type Grain = 'dong' | 'gu';

type Dispatch = (a: any) => void;
type GetVisState = () => any;

export const dataIdFor = (x: Variable, grain: Grain) =>
  x.dataset === 'dong' ? grain : x.dataset === 'dong_daily' ? (grain === 'dong' ? 'dong_daily' : 'gu_daily') : x.dataset;
export const isDailyDataId = (id: string) => id === 'gu_daily' || id === 'dong_daily';

// One entry per variable drawn on the map right now — kepler's visibility, which its own
// settings panel may change. A pair layer (bi:A:B) carries two variables, so it appears
// twice: part 'a' (colour / grid rows) and part 'b' (height / size / grid columns).
export type OnMap = {layer: any; variable: Variable; pairPart?: 'a' | 'b'};

export function layersOnMap(visState: any): OnMap[] {
  const out: OnMap[] = [];
  for (const l of visState?.layers || []) {
    if (!l.config.isVisible) continue;
    const pair = pairKeysOf(l.id);
    if (pair) {
      pair.forEach((k, i) => VAR_BY_KEY[k] && out.push({layer: l, variable: VAR_BY_KEY[k], pairPart: i === 0 ? 'a' : 'b'}));
    } else {
      const variable = varOfLayerId(l.id);
      if (variable) out.push({layer: l, variable});
    }
  }
  return out;
}

// How a selection is drawn. Two variables of one kind — two static area ones, or two
// daily ones — are compared: linked, on one pair layer (areas → the bivariate grid /
// colour + height; daily points on the same rows → colour by A, size by B); unlinked, or
// when the two daily ones sit on different rows (neighbourhood sales vs district weather
// under Dong detail), side by side in kepler's split map. A static and a daily variable
// are simply drawn together, the points over the fill.
export type Plan = {layers: string[]; pairable: boolean; areaPair?: [Variable, Variable];
  dailyPair?: [Variable, Variable]; split?: [string, string]};

// In 3D daily variables stand up as hexagonal columns (c:key, and bc:A:B for a pair) —
// kepler's points cannot be raised; areas raise their own polygons.
export function planFor(selection: string[], linked: boolean, grain: Grain, is3d = false): Plan {
  const vars = selection.map((k) => VAR_BY_KEY[k]).filter(Boolean);
  const [a, b] = vars;
  const sameKind = vars.length === 2 && isTemporal(a) === isTemporal(b);
  const pairable = sameKind && dataIdFor(a, grain) === dataIdFor(b, grain);
  if (pairable && linked) {
    if (!isTemporal(a)) return {layers: [pairIdOf(a.key, b.key)], pairable, areaPair: [a, b]};
    return {layers: [is3d ? columnPairIdOf(a.key, b.key) : pairIdOf(a.key, b.key)], pairable, dailyPair: [a, b]};
  }
  const layers = vars.map((x) => (is3d && isTemporal(x) ? columnIdOf(x.key) : layerIdOf(x.key)));
  return {layers, pairable, split: sameKind ? [layers[0], layers[1]] : undefined};
}

// The same variable's layer in the other mode: points ↔ columns.
const twinOf = (id: string) => id.startsWith('v:') ? `c:${id.slice(2)}` : id.startsWith('c:') ? `v:${id.slice(2)}`
  : id.startsWith('bi:') ? `bc:${id.slice(3)}` : id.startsWith('bc:') ? `bi:${id.slice(3)}` : null;

// The selection as cards: each variable with the kepler layer that draws it (missing for
// a moment while a pair layer is being built).
export function selectionEntries(visState: any, selection: string[], linked: boolean, grain: Grain,
  is3d = false): (OnMap & {layer: any})[] {
  const plan = planFor(selection, linked, grain, is3d);
  const find = (id: string) => (visState?.layers || []).find((l: any) => l.id === id);
  const paired = !!(plan.areaPair || plan.dailyPair);
  const keys = selection.filter((k) => VAR_BY_KEY[k]);
  return keys.map((k, i) => paired
    ? {layer: find(plan.layers[0]), variable: VAR_BY_KEY[k], pairPart: i === 0 ? 'a' : 'b'}
    : {layer: find(plan.layers[i]), variable: VAR_BY_KEY[k]});
}

const isOurs = (id: string) => ['v:', 'c:', 'bi:', 'bc:'].some((p) => id.startsWith(p));

// Draws the selection: the planned layers on, every other layer of ours off and out of
// kepler's layer list. Runs only when the selection, the link, the grain or the data
// change — never on kepler's own visibility, so the eye in kepler's panel works on its
// own in between. `get` reads the latest state, as each step builds on the last.
export function drawSelection(dispatch: Dispatch, get: GetVisState,
  opts: {selection: string[]; linked: boolean; grain: Grain; is3d: boolean; data: UhusData; modeOnly?: boolean}) {
  const {selection, linked, grain, is3d, data, modeOnly} = opts;
  const plan = planFor(selection, linked, grain, is3d);
  const want = new Set(plan.layers);
  const find = (vs: any, id: string) => vs.layers.find((l: any) => l.id === id);

  // One map unless side by side. Closing a half hides what is not in the other one, so
  // the layers to keep are put into the left half first.
  let vs = get();
  if (vs.splitMaps?.length && !plan.split) {
    const left = vs.splitMaps[0]?.layers || {};
    for (const id of want) if (find(vs, id) && !left[id]) dispatch(toggleLayerForMap(0, id));
    dispatch(toggleSplitMap(1));
  }

  // The neighbourhood pair has its own small dataset: kept while it is the same pair in
  // the same grain, rebuilt otherwise, dropped when no pair is wanted. kepler adds it as a
  // task, so for a moment after addPair neither the dataset nor its layer is there yet —
  // and removing the old one re-runs this right then. A pair on its way is not added
  // again: two layers with one id made deck.gl stop with an "assertion failed" error.
  vs = get();
  const pairId = plan.areaPair ? plan.layers[0] : null;
  const pairDataId = pairDataIdOf(grain);
  const onItsWay = pairId != null && pendingPair?.layerId === pairId && pendingPair.dataId === pairDataId
    && Date.now() - pendingPair.at < 5000;
  if (pairId && find(vs, pairId)?.config.dataId === pairDataId) pendingPair = null;   // arrived
  for (const id of Object.keys(vs.datasets)) {
    if (!isPairDataId(id)) continue;
    const keep = pairId && id === pairDataId && (find(vs, pairId)?.config.dataId === id || onItsWay);
    if (!keep) dispatch(removeDataset(id));
  }
  vs = get();
  if (plan.areaPair && !find(vs, pairId!) && !onItsWay) {
    addPair(dispatch, data, grain, plan.areaPair[0], plan.areaPair[1], is3d);
    pairMode.set(pairId!, is3d);
    pendingPair = {layerId: pairId!, dataId: pairDataId, at: Date.now()};
  }
  // Single-variable layers and the daily pair: created the first time, reused after —
  // so settings made in kepler's panel survive unlinking and linking again.
  // A layer whose dataset is not loaded yet (daily sales per dong load on demand) waits:
  // the next run, when it has arrived, creates it.
  for (const id of want) {
    const existing = find(vs, id);
    const x = varOfLayerId(id);
    if (x) {
      const dataId = dataIdFor(x, grain);
      if (!vs.datasets[dataId]) continue;
      const cfg: any = id.startsWith('c:') ? columnConfigFor(x, dataId)
        : {...layerConfigFor(x), config: {...layerConfigFor(x).config, dataId}};
      if (!existing) dispatch(addLayer(cfg, dataId));
      else if (existing.config.dataId !== dataId) dispatch(layerConfigChange(existing, {dataId}));
    } else if (plan.dailyPair) {
      const [a, b] = plan.dailyPair;
      const dataId = dataIdFor(a, grain);
      if (!vs.datasets[dataId]) continue;
      const cfg: any = id.startsWith('bc:') ? dailyColumnPairConfig(a, b, dataId) : dailyPairConfig(a, b, dataId);
      if (!existing) dispatch(addLayer(cfg, dataId));
      else if (existing.config.dataId !== dataId) dispatch(layerConfigChange(existing, {dataId}));
    }
  }

  // On a 2D ↔ 3D switch alone, a layer hidden with the eye in kepler's panel passes that
  // on to its twin (points ↔ columns) instead of coming back.
  vs = get();
  for (const l of vs.layers) {
    if (!isOurs(l.id)) continue;
    if (want.has(l.id)) {
      const twin = modeOnly && twinOf(l.id) ? find(vs, twinOf(l.id)!) : null;
      const userHid = !!twin && !twin.config.isVisible && !twin.config.hidden;
      if (userHid) { if (l.config.isVisible || l.config.hidden) dispatch(layerConfigChange(l, {isVisible: false, hidden: false} as any)); }
      else if (!l.config.isVisible || l.config.hidden) dispatch(layerConfigChange(l, {isVisible: true, hidden: false} as any));
      // columns stand up; being hidden in 2D had dropped their height
      if (l.type === 'hexagonId' && !l.config.visConfig.enable3d) dispatch(layerVisConfigChange(l, {enable3d: true}));
    } else if (l.config.isVisible || !l.config.hidden) {
      hideLayer(dispatch, l);
    }
  }

  // Side by side: kepler opens the split with every layer in the left half — A stays
  // there, B moves to the right.
  if (plan.split) {
    if (!get().splitMaps?.length) dispatch(toggleSplitMap(undefined as any));
    const split = get().splitMaps;
    const [a, b] = plan.split;
    const flags: [number, string, boolean][] = [[0, a, true], [0, b, false], [1, a, false], [1, b, true]];
    for (const [i, id, on] of flags) if (!!split[i]?.layers?.[id] !== on) dispatch(toggleLayerForMap(i, id));
  }
}

// Off from our UI, a layer also leaves kepler's layer list (kepler's own `hidden` flag,
// which only the list and legend read), so the settings panel lists what the selection
// draws and nothing else.
function hideLayer(dispatch: Dispatch, layer: any) {
  dispatch(layerConfigChange(layer, {isVisible: false, isConfigActive: false, hidden: true} as any));
  // a hidden layer gives up its height, so it cannot come back as a second raised layer
  if (layer.config.visConfig.enable3d) dispatch(layerVisConfigChange(layer, {enable3d: false}));
}

// 2D ↔ 3D for the neighbourhood pair: the bivariate grid lies flat, colour + height
// stands up. Restyled only on a real switch, so a colour field or palette picked in
// kepler's panel otherwise stays.
const pairMode = new Map<string, boolean>();
// The area pair last asked of kepler and not seen on the map yet (see drawSelection).
let pendingPair: {layerId: string; dataId: string; at: number} | null = null;
export function restylePair(dispatch: Dispatch, visState: any, is3d: boolean) {
  const layer = (visState?.layers || []).find((l: any) => pairKeysOf(l.id) && isPairDataId(l.config.dataId));
  const keys = layer && pairKeysOf(layer.id);
  if (!layer || !keys || pairMode.get(layer.id) === is3d) return;
  pairMode.set(layer.id, is3d);
  const [a, b] = keys.map((k: string) => VAR_BY_KEY[k]);
  const wantField = is3d ? a.key : PAIR_FIELD;
  const field = visState.datasets[layer.config.dataId]?.fields.find((f: any) => f.name === wantField);
  const channel: any = pairColourChannel(a, is3d);
  if (field) dispatch(layerVisualChannelConfigChange(layer, {colorField: field, colorScale: channel.colorScale} as any,
    'color', pairVisConfig(a, b, is3d) as any));
}

// Drawing order, front to back: daily points, then the area layers. kepler draws the
// first id in layerOrder in front, and puts every newly added layer there.
export function syncOrder(dispatch: Dispatch, visState: any) {
  const order: string[] = visState?.layerOrder || [];
  const isDaily = (id: string) => isDailyDataId(visState.layers.find((l: any) => l.id === id)?.config.dataId ?? '');
  const rank = (id: string) => (isDaily(id) ? 0 : 1);
  const next = order.map((id, i) => ({id, i})).sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i).map((o) => o.id);
  if (next.some((id, i) => id !== order[i])) dispatch(reorderLayer(next));
}

// 3D: the area layer stands up — in the split map, the area layer of each half. Run on a
// mode switch or when a different area layer comes on, so a height turned off in kepler's
// panel otherwise stays off.
// 2D: nothing is raised.
export function sync3d(dispatch: Dispatch, visState: any, is3d: boolean) {
  const layers = visState?.layers || [];
  if (!is3d) {
    // the polygons lie down; daily columns are swapped back to points by drawSelection
    for (const l of layers) if (l.type === 'geojson' && l.config.visConfig?.enable3d) dispatch(layerVisConfigChange(l, {enable3d: false}));
    return;
  }
  const fills = layersOnMap(visState).filter((x) => x.layer.type === 'geojson').map((x) => x.layer);
  const targets = visState.splitMaps?.length ? fills : fills.slice(0, 1);
  for (const l of new Set(targets)) if (!l.config.visConfig.enable3d) dispatch(layerVisConfigChange(l, {enable3d: true}));
}

// Raised heights are in metres, so on screen they double with every zoom level: walls that
// read well over all of Seoul turned into a screen-filling cliff once zoomed into a
// district. Keep their on-screen height roughly constant instead — kepler's look at the
// city view (scale 5 at zoom 10.4), halved for each level closer.
const ELEV_AT_CITY = 5, CITY_ZOOM = 10.4;
export const elevationFor = (zoom: number) =>
  Math.min(12, Math.max(0.25, ELEV_AT_CITY * Math.pow(2, CITY_ZOOM - zoom)));

// `ours` remembers the scale this code last set per layer. If a layer's scale no longer
// matches it, the user changed it in ⚙ — that layer is theirs and is left alone.
export function adaptElevation(dispatch: Dispatch, visState: any, zoom: number, ours: Map<string, number>) {
  const target = elevationFor(zoom);
  for (const l of visState?.layers || []) {
    if (!l.config.isVisible || !l.config.visConfig?.enable3d) continue;
    const current = l.config.visConfig.elevationScale;
    const last = ours.get(l.id);
    if (last !== undefined && Math.abs(current - last) > 1e-6) continue;   // user's own setting
    if (Math.abs(current - target) / target < 0.08) continue;              // close enough already
    dispatch(layerVisConfigChange(l, {elevationScale: target}));
    ours.set(l.id, target);
  }
}

// ⚙ — the one way into kepler's settings: the Layers tab, with every layer that is on
// the map opened up for editing (at most three) and nothing else listed.
export function openMapSettings(dispatch: Dispatch, visState: any) {
  for (const l of visState?.layers || []) {
    const open = !!l.config.isVisible;
    if (!!l.config.isConfigActive !== open) dispatch(layerConfigChange(l, {isConfigActive: open}));
  }
  dispatch(toggleSidePanel('layer'));
}

// The hover tooltip names the place and lists the value of every variable on the map.
// kepler stores tooltip fields per dataset — grouped by where each layer is drawn now.
const tooltipWritten = new WeakSet<object>();   // datasets (by their data) whose list this code set
export function syncTooltip(dispatch: Dispatch, visState: any) {
  const tooltip = visState?.interactionConfig?.tooltip;
  if (!tooltip) return;
  const on = layersOnMap(visState);
  const f = (name: string) => ({name, format: null});
  const varsIn = (dataId: string) => on.filter((x) => x.layer.config.dataId === dataId).map((x) => f(x.variable.key));
  const names = (dataId: string) => [f('gu_name'), ...(dataId.startsWith('dong') ? [f('dong_name')] : []),
    ...(isDailyDataId(dataId) ? [f('date')] : [])];
  const next: Record<string, any[]> = {};
  const pairIds = on.map((x) => x.layer.config.dataId).filter(isPairDataId);
  const current = tooltip.config?.fieldsToShow || {};
  const ids = ['dong', 'gu', 'gu_daily', ...(visState.datasets?.dong_daily ? ['dong_daily'] : []), ...new Set(pairIds)];
  for (const id of ids) {
    // a pair's tooltip also names its class, e.g. "RHSI high · Elderly low"
    const required = [...names(id), ...varsIn(id), ...(isPairDataId(id) ? [f(PAIR_FIELD)] : [])];
    // Fields added in kepler's Interactions tab stay, and so do number formats set
    // there; only variables that left the map drop out. A dataset this code has not
    // written for yet carries kepler's own first-five default instead — not kept.
    const had: any[] = current[id] || [];
    const kept = required.map((r) => had.find((h) => h.name === r.name) ?? r);
    const dc = visState.datasets[id]?.dataContainer;
    const extras = dc && tooltipWritten.has(dc)
      ? had.filter((h, i) => !required.some((r) => r.name === h.name) && !VAR_BY_KEY[h.name]
        && had.findIndex((o) => o.name === h.name) === i)
      : [];
    next[id] = [...kept, ...extras];
    if (dc) tooltipWritten.add(dc);
  }
  if (JSON.stringify(next) === JSON.stringify(tooltip.config?.fieldsToShow)) return;
  dispatch(interactionConfigChange({...tooltip, config: {...tooltip.config, fieldsToShow: next}}));
}
