import {applyMiddleware, combineReducers, compose, createStore} from 'redux';
import keplerGlReducer, {enhanceReduxMiddleware, INITIAL_MAP_STYLE, INITIAL_UI_STATE, visStateUpdaters} from '@kepler.gl/reducers';

// kepler's basemap list also carries Mapbox-hosted styles, which need a token this app does
// not have (picking one only failed to load) and do not suit its colours anyway. Its Base
// map tab keeps the token-free ones — the same four the atlas's Settings offers.
const FREE_BASEMAPS = ['dark-matter', 'positron', 'voyager', 'no_map'];
const freeMapStyles = Object.fromEntries(Object.entries(INITIAL_MAP_STYLE.mapStyles).filter(([id]) => FREE_BASEMAPS.includes(id)));

// Every built-in map control is hidden: the top bar and the Focus block own those
// jobs, and kepler's own buttons would all land in the top-right corner that the
// 2D graph card needs. Spread the defaults so each control keeps its other keys.
const hiddenControls = Object.fromEntries(
  Object.entries(INITIAL_UI_STATE.mapControls).map(([k, v]) => [k, {...(v as object), show: false}])
);

// kepler 3.2.6 redraws only the changed filter's chart, and keeps a time chart's bins once
// drawn: the playback filter's year, shown when it is enlarged, went on showing the rows
// that passed when it was first drawn. While it is enlarged, any other filter's change — the
// atlas's or one from kepler's Filters tab — and opening it redraw it from the rows that pass
// now (its own day stepping does not; the chart leaves its own filter out).
const othersOf = (vs: any) => (vs?.filters || []).filter((f: any) => f.id !== 'time')
  .map((f: any) => `${f.id}:${f.dataId}:${f.name}:${f.value}`).join('|');
function freshTimeChart(reducer: any) {
  return (state: any, action: any) => {
    const next = reducer(state, action);
    const before = state?.map?.visState, now = next?.map?.visState;
    if (!now || before === now) return next;
    const idx = now.filters.findIndex((f: any) => f.id === 'time');
    const time = now.filters[idx];
    if (!time || time.view !== 'enlarged' || !time.plotType) return next;
    const opened = before?.filters?.find((f: any) => f.id === 'time')?.view !== 'enlarged';
    if (!opened && othersOf(before) === othersOf(now)) return next;
    const cleared = {...now, filters: now.filters.map((f: any, i: number) => (i === idx ? {...f, timeBins: undefined, lineChart: undefined} : f))};
    const visState = (visStateUpdaters as any).setFilterPlotUpdater(cleared, {idx, newProp: {plotType: time.plotType}});
    return {...next, map: {...next.map, visState}};
  };
}

const reducers = combineReducers({
  keplerGl: freshTimeChart(keplerGlReducer.initialState({
    uiState: {
      readOnly: false,          // the layer settings panel must stay reachable from the gear button
      currentModal: null,
      activeSidePanel: null,    // closed until a gear button opens it
      mapControls: hiddenControls
    },
    mapStyle: {mapStyles: freeMapStyles}
  } as any))
});

const middlewares = enhanceReduxMiddleware([]);

export const store = createStore(reducers, {}, compose(applyMiddleware(...middlewares)));
export type RootState = ReturnType<typeof store.getState>;
