import {startTransition, useEffect, useMemo, useRef, useState} from 'react';
import {X} from 'lucide-react';
import {useDispatch, useSelector, useStore} from 'react-redux';
import {cancelFlight, flyToBounds, flyToView} from './flyTo';
import type {Bounds, Place, UhusData} from '../data/uhus';
import {SEOUL_VIEW, INITIAL_ON_MAP} from '../data/mapConfig';
import {THEMES, VAR_BY_KEY, colorRangeFor, isTemporal, varOfLayerId, varsOf, type ThemeKey} from '../data/catalog';
import {OPENING_YEAR, spanOf} from '../data/sources';
import {loadDongDaily} from '../data/uhus';
import {addedRowCount, addedYearSpan, dailyBase, dailyExtras, isOnDemand, joinStatic, loadIndustries, setActiveYears, setDailyBase,
  withIndustries} from '../data/industries';
import {useCamera, useVisState} from './useKepler';
import {addDataToMap, onLayerClick, replaceDataInMap, setFilter, setFilterPlot, setFilterView, togglePerspective} from '@kepler.gl/actions';
import {adaptElevation, dataIdFor, drawSelection, layersOnMap, planFor, restylePair, setAggregateView, setCellView, setPointsShow, sync3d, syncOrder, toggleLink, withMain,
  syncTooltip, type Grain} from './layers';
import {POINT_DATA, loadStations, pointsOf, putStationTables, stationTables, syncSpecks} from './stations';
import {aggDataIdOf, aggregateTable, combineByPlace, combineFor, DEFAULT_TIME_VIEW, SEOUL_SCOPE, recolourAggregate, recolourTimeline, type Scope, type TimeView} from './timeModes';
import {BIVARIATE, pairKeysOf, recolourDailyPair} from './pair';
import type {Period} from './TimeRuler';
import TopBar, {SideRail, type PageId} from './TopBar';
import SearchBox from './SearchBox';
import StatusBar from './StatusBar';
import FocusBlock from './FocusBlock';
import GraphCard from './GraphCard';
import Drawer from './Drawer';
import TimeCard from './TimeCard';
import Dashboard from './dashboard/Dashboard';
import SettingsPanel, {rememberedAnnotations, rememberedFx, restoreSettings} from './SettingsPanel';
import {isHaloId, syncEffects, syncHalos, type Fx} from './effects';
import MapAnnotations, {type Annotations} from './MapAnnotations';
import DataPage from './pages/DataPage';
import AboutPage from './pages/AboutPage';
import {useUiScale} from './uiScale';
import {enterSandbox, leaveSandbox} from './sandbox';
import SandboxBar from './SandboxBar';
import MapScale from './MapScale';
import {filtersKey, syncOurFilters, type Ranges} from './ourFilters';
import {showDongOutline} from './outline';

export type Focus = {level: 'seoul'} | {level: 'gu'; gu: Place} | {level: 'dong'; gu: Place; dong: Place};

// ?blur=always | motion | off. Measured on the dev machine: blur kept on during playback
// and camera flights still ran at 60fps, while 'motion' visibly flickered the panels
// solid/translucent on every pan. So blur stays on; 'motion' is a fallback for weak GPUs.
const BLUR_MODE = new URLSearchParams(location.search).get('blur') || 'always';

// Each theme's headline starts as whatever that theme has on the map, else its first variable.
const initialHeadline = () => Object.fromEntries(THEMES.map((t) => {
  const on = INITIAL_ON_MAP.find((k) => VAR_BY_KEY[k]?.theme === t.key);
  return [t.key, on ?? varsOf(t.key)[0]?.key];
})) as Record<ThemeKey, string>;

export default function Overlay({data}: {data: UhusData | null}) {
  const dispatch = useDispatch();
  const store = useStore<any>();
  // not the whole kepler instance: its camera changes every frame of a flight, and this
  // component re-rendering with it re-rendered every panel (the flight ran at a few frames
  // a second). The camera is read where it is needed: as of now, or as a value (useCamera).
  const visState = useVisState();
  const camera = () => store.getState().keplerGl.map?.mapState;
  const [focus, setFocusNow] = useState<Focus>({level: 'seoul'});
  // A new place redraws every panel for it (a fifth of a second and more): as a transition,
  // React does that work in slices, between the frames of the flight that starts with it,
  // instead of holding the map still until it is done.
  const setFocus = (f: Focus) => startTransition(() => setFocusNow(f));
  const [grain, setGrainState] = useState<Grain>('dong');
  // What the map is about: up to two variables, linked from the drawer (🔗). Two of a
  // kind are shown on one shared layer (linked, the default) or ⛓ side by side.
  const [selection, setSelection] = useState<string[]>(INITIAL_ON_MAP);
  // An industry's sales are not on the daily tables until first shown: its file loads, its
  // column joins them (refreshDailyTables), and only then does it go on the map — a layer
  // never points at a column that is not there yet.
  // per slot, the industry loading for it
  const [industryLoading, setIndustryLoading] = useState<{main?: string; link?: string}>({});
  // an industry is on the daily tables once its column is on each of them that is there (its
  // file may have loaded earlier without one: the dashboard's sales panel reads files on its own)
  const onTables = (key: string) => {
    const sets = store.getState().keplerGl.map?.visState.datasets;
    return !!sets?.gu_daily && ['gu_daily', 'dong_daily'].every((id) => !sets[id] || sets[id].fields.some((f: any) => f.name === key));
  };
  // resolves once the column is there — a rebuild lands a task later (replaceDataInMap)
  const columnIn = (key: string) => new Promise<void>((done) => {
    if (onTables(key)) return done();
    const stop = store.subscribe(() => { if (onTables(key)) { stop(); done(); } });
  });
  // Per slot, only the latest pick counts: an industry still loading when something else is
  // picked for the main (or the link) is not put there when it arrives, and does not clear
  // the newer one's spinner. A main and a link picked together both land.
  const latestPick = useRef({main: 0, link: 0});
  // as the main (the drawer's map button, a search hit) or linked to it (🔗)
  // 'alone': that variable on the map by itself, the link dropped (the time ruler's expand)
  const select = (key: string, how: 'main' | 'link' | 'alone' = 'link') => {
    const next = how === 'alone' ? (_: string[], k: string) => [k] : how === 'main' ? withMain : toggleLink;
    const as = how === 'link' ? 'link' : 'main';
    const pick = ++latestPick.current[as];
    const current = () => pick === latestPick.current[as];
    if (isOnDemand(key) && !onTables(key)) {
      setIndustryLoading((l) => ({...l, [as]: key}));
      loadIndustries([key])
        .then(() => { refreshDailyTables(); return columnIn(key); })
        .then(() => { if (current()) setSelection((s) => next(s, key)); })
        .catch((e) => console.error('industry sales failed to load', e))
        .finally(() => { if (current()) setIndustryLoading((l) => ({...l, [as]: undefined})); });
      return;
    }
    setIndustryLoading((l) => ({...l, [as]: undefined}));
    setSelection((s) => next(s, key));
  };
  // Rebuilds the daily tables with every industry loaded so far, keeping the layers and
  // filters on them (kepler's replaceDataInMap)
  const refreshDailyTables = () => {
    const sets = store.getState().keplerGl.map.visState.datasets;
    for (const [id, level, label] of [['gu_daily', 'gu', 'Gu · daily'], ['dong_daily', 'dong', 'Dong · daily']] as const) {
      const base = dailyBase(level);
      if (!sets[id] || !base) continue;
      if (dailyExtras().every((k) => sets[id].fields.some((f: any) => f.name === k))
        && sets[id].dataContainer.numRows() === base.rows.length + addedRowCount(level) && addedYearsIn(sets[id], base.rows.length, level)) continue;
      const table = withIndustries(base, level);
      dispatch(replaceDataInMap({datasetToReplaceId: id, datasetToUse: {info: {id, label}, data: table} as any,
        options: {keepExistingConfig: true, centerMap: false, autoCreateLayers: false}} as any) as any);
    }
  };
  // whether a table's added rows (after its own) are of the years asked: first and last
  const addedYearsIn = (set: any, own: number, level: 'gu' | 'dong') => {
    const span = addedYearSpan(level);
    if (!span) return true;
    const date = set.fields.findIndex((f: any) => f.name === 'date'), n = set.dataContainer.numRows();
    const yearAt = (r: number) => Number(String(set.dataContainer.valueAt(r, date)).slice(0, 4));
    return n > own && yearAt(own) === span[0] && yearAt(n - 1) === span[1];
  };
  useEffect(() => { if (data?.guDaily) setDailyBase('gu', data.guDaily as any); }, [data]);
  // A rebuild asked for while another was in flight finds the table swapped out and skips it,
  // so the one that lands may lack a column: whenever a daily table changes, put back any
  // loaded industry it lacks (a no-op when none is missing).
  const dailyFields = ['gu_daily', 'dong_daily'].map((id) => visState?.datasets?.[id]?.fields.length ?? 0).join();
  const dailyRows = ['gu_daily', 'dong_daily'].map((id) => visState?.datasets?.[id]?.dataContainer?.numRows() ?? 0).join();
  useEffect(() => { refreshDailyTables(); }, [dailyFields, dailyRows]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [linked, setLinked] = useState(true);
  // the atlas's own filters: a value range per selected variable (ourFilters.ts)
  const [ranges, setRanges] = useState<Ranges>({});
  const setRange = (key: string, r: [number, number] | null) =>
    setRanges((cur) => { const next = {...cur}; if (r) next[key] = r; else delete next[key]; return next; });
  // daily playback (the time card steps day by day; see TimeCard)
  const [playing, setPlaying] = useState(false);
  // the period the time ruler picks (TimeRuler): playback runs inside it, the drawer dims what
  // has no data in it. It opens on the year the most daily variables cover (OPENING_YEAR, 2024),
  // though the ruler runs over every year the atlas has data for.
  const [period, setPeriod] = useState<Period>(() => [Date.UTC(OPENING_YEAR, 0, 1), Date.UTC(OPENING_YEAR + 1, 0, 1)]);
  // A variable over many years (the subway) has rows on the daily tables for the years the period
  // touches beyond 2024: as the period moves, those years' files load and the tables are rebuilt
  // with them (and without the years it left).
  const multiYear = selection.filter((k) => VAR_BY_KEY[k]?.years).join();
  useEffect(() => {
    const years: number[] = [];
    for (let y = new Date(period[0]).getUTCFullYear(); y <= new Date(period[1] - 1).getUTCFullYear(); y++) years.push(y);
    const changed = setActiveYears(multiYear ? years : []);
    const keys = multiYear ? multiYear.split(',') : [];
    loadIndustries(keys).then(() => { if (changed || keys.length) refreshDailyTables(); })
      .catch((e) => console.error('a year of daily data failed to load', e));
  }, [period[0], period[1], multiYear]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [dashboardOpen, setDashboardOpen] = useState(false);
  // the study the atlas is narrowed to (the drawer's "UHUS only"): what it does not use dims
  const [onlyProject, setOnlyProject] = useState<string | null>(null);
  // the top bar's other tabs: a page covering the map (Data, About), and the settings panel
  const [page, setPage] = useState<PageId>('map');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // gu and dong names and dashed boundaries over the map (Settings → Map layers)
  const [annotations, setAnnotations] = useState<Annotations>(rememberedAnnotations);
  // the night-city light: glow, halos, light & shadow, vignette (effects.ts; Settings → Effects)
  const [fx, setFx] = useState<Fx>(rememberedFx);
  const closePage = useStableClose(() => setPage('map'));
  const closeSettings = useStableClose(() => setSettingsOpen(false));
  // Clean mode (the earlier atlas's): every panel steps aside but the place's name and the
  // status bar — the map alone, still live. Left by its button at the top right, or Esc.
  const [clean, setClean] = useState(false);
  const enterClean = () => { setSettingsOpen(false); setDashboardOpen(false); setClean(true); };
  useEffect(() => {
    document.body.classList.toggle('clean-mode', clean);
    if (!clean) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setClean(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [clean]);
  // Sandbox: the map is kepler's alone — every atlas effect below stands aside (sandbox.ts)
  const sandbox = page === 'sandbox';
  const setGrain = (g: Grain) => setGrainState(g);   // drawSelection redraws for the new grain
  const [headline, setHeadlineState] = useState(initialHeadline);
  const setHeadline = (theme: ThemeKey, key: string) => {
    setHeadlineState((h) => ({...h, [theme]: key}));
    // an industry as a theme's headline needs its sales on the daily tables too
    if (isOnDemand(key) && !onTables(key)) loadIndustries([key]).then(refreshDailyTables).catch(() => {});
  };

  const flyTo = (bounds: Bounds) => { const m = camera(); if (m) flyToBounds(dispatch, m, bounds); };
  const focusSeoul = () => { setFocus({level: 'seoul'}); const m = camera(); if (m) flyToView(dispatch, m, SEOUL_VIEW); };
  const focusGu = (gu: Place) => { setFocus({level: 'gu', gu}); flyTo(gu.bounds); };
  const focusDong = (dong: Place) => {
    const gu = data?.gus.find((g) => g.code === dong.guCode);
    if (!gu) return;
    setFocus({level: 'dong', gu, dong});
    flyTo(dong.bounds);
  };

  // A pinned map tooltip (a clicked place) carries kepler's ‹ arrow, which only flipped the
  // tooltip to the other side. Here it goes one level up instead — a neighbourhood to its
  // district, a district to all of Seoul — and lets go of the pin. The click is caught
  // before it reaches kepler (capture, on window); the label beside the arrow says where.
  const goUp = useRef(() => {});
  goUp.current = () => {
    if (focus.level === 'dong') focusGu(focus.gu);
    else if (focus.level === 'gu') focusSeoul();
    dispatch(onLayerClick(null) as any);
  };
  useEffect(() => {
    const up = (e: MouseEvent) => {
      if (document.body.classList.contains('sandbox')) return;
      if (!(e.target as Element)?.closest?.('.map-popover .popover-arrow-left, .map-popover .popover-arrow-right')) return;
      e.stopPropagation();
      e.preventDefault();
      goUp.current();
    };
    window.addEventListener('click', up, true);
    return () => window.removeEventListener('click', up, true);
  }, []);
  const upLabel = focus.level === 'dong' ? focus.gu.name : focus.level === 'gu' ? 'Seoul' : '';
  useEffect(() => { document.body.style.setProperty('--popover-up', JSON.stringify(upLabel)); }, [upLabel]);

  // Grabbing the map mid-flight hands control back to the user instead of fighting them.
  useEffect(() => {
    const grab = (e: PointerEvent) => { if ((e.target as Element)?.closest?.('.kepler-gl')) cancelFlight(); };
    window.addEventListener('pointerdown', grab, true);
    return () => window.removeEventListener('pointerdown', grab, true);
  }, []);

  // Clicking a neighbourhood on the map focuses it (feature 2). kepler would also pin its
  // tooltip there, a box that stayed over the panels; the click is let go of once read, so
  // only the hover tooltip shows (its ‹ up-arrow above goes with it for now).
  const clicked = visState?.clicked;
  useEffect(() => {
    if (!clicked || !data || sandbox) return;
    const picked = pickedPlace(clicked, visState);
    dispatch(onLayerClick(null) as any);
    if (picked?.level === 'dong') { const d = data.dongs.find((x) => x.code === picked.code); if (d) focusDong(d); }
    if (picked?.level === 'gu') { const g = data.gus.find((x) => x.code === picked.code); if (g) focusGu(g); }
    // focusDong is recreated each render; the click is the only real trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clicked, data]);

  // Keep the hover tooltip listing exactly the variables that are on the map, and the
  // daily points stacked over the area layers.
  const onMapKeys = layersOnMap(visState).map((x) => `${x.layer.id}@${x.layer.config.dataId}`).join(',');
  useEffect(() => { if (visState && !sandbox) syncTooltip(dispatch, visState); }, [onMapKeys, sandbox]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Stacking is set when a layer is created (kepler puts new ones on top), so an order
  // dragged in kepler's panel holds until the next new layer.
  const layerCount = visState?.layers?.length ?? 0;
  useEffect(() => { if (visState && !sandbox) syncOrder(dispatch, visState); }, [layerCount, sandbox]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 2D / 3D. kepler's own dragRotate flag is the single source of truth (its perspective
  // toggle tilts to 50° and rotates 24°). Heights are set when the mode switches or a
  // different area layer comes on — not on every change, so a height turned off in
  // kepler's panel stays off.
  const is3d = useCamera((m) => !!m?.dragRotate);
  // 3D from afar: the areas as a flat hex grid (layers.ts cellView) — below zoom 8.8, and
  // once in it, back to the areas only from 9.0, so it does not flicker at the edge.
  // Settings → Map layers switches it off.
  const cellRef = useRef(false);
  // (the zoom only as the switch needs it — below 8.8, between, from 9.0 — so a flight
  // re-renders this only where it crosses those)
  const zoomBand = useCamera((m) => { const z = m?.zoom ?? 0; return z < 8.8 ? 0 : z < 9.0 ? 1 : 2; });
  cellRef.current = annotations.hexFar && (cellRef.current ? zoomBand < 2 : zoomBand < 1);
  setCellView(cellRef.current);
  const cellView = is3d && cellRef.current;
  // The time card's folder tabs and Value row (timeModes.ts): Timeline or Aggregate; Actual or vs Avg
  // (the default, on the same day). A linked pair keeps its own day-by-day grid, so Aggregate waits
  // for one daily variable (or two side by side); set here, during render, like cellView.
  const [timeShow, setTimeShow] = useState<TimeView>(DEFAULT_TIME_VIEW);
  const hasDaily = selection.some((k) => VAR_BY_KEY[k] && isTemporal(VAR_BY_KEY[k]));
  const pairedNow = linked && selection.length === 2 && planFor(selection, linked, grain).pairable;
  const aggregateOn = timeShow.mode === 'aggregate' && hasDaily;
  setAggregateView(aggregateOn);
  setPointsShow(timeShow.show);
  // Stations, stops and docks for the variable that has them (stations.ts): its tables built for the
  // Show as and the ruler's period, then put on the map; the faint specks follow.
  const ptsKey = timeShow.show === 'dong' ? null : selection.find((k) => pointsOf(k)) ?? null;
  const hasLayers = (visState?.layers?.length ?? 0) > 0;
  useEffect(() => {
    if (!ptsKey || !hasLayers || sandbox) return;
    let live = true;
    const x = VAR_BY_KEY[ptsKey];
    loadStations(pointsOf(ptsKey).kind, period).then((file) => {
      if (!live) return;
      putStationTables(dispatch, store.getState().keplerGl.map.visState, stationTables(file, x, timeShow.show, timeShow.pct, period, timeShow.combine));
    }).catch((e) => console.error('stations failed to load', e));
    return () => { live = false; };
  }, [ptsKey, timeShow.show, timeShow.pct, timeShow.combine, period[0], period[1], hasLayers, sandbox]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (aggregateOn) setPlaying(false); }, [aggregateOn]);
  const toggle3d = () => dispatch(togglePerspective() as any);
  const fillIds = layersOnMap(visState).filter((x) => x.layer.type === 'geojson').map((x) => x.layer.id).join(',');
  const lastHeights = useRef<{is3d: boolean; fillIds: string} | null>(null);
  const splitCount = visState?.splitMaps?.length ?? 0;

  // Draw the selection whenever it, the link or the grain changes — and only then, so
  // the eye in kepler's own panel shows and hides layers freely in between.
  const layersLoaded = (visState?.layers?.length ?? 0) > 0;
  const selectionKey = selection.join(',');
  const datasetKeys = Object.keys(visState?.datasets || {}).join(',');

  // Daily sales per dong (9.8MB) load the first time they are needed, then join the time
  // filter so they play with the rest.
  const dongDailyNeeded = grain === 'dong' && selection.some((k) => VAR_BY_KEY[k]?.dataset === 'dong_daily');
  const dongDailyLoading = useRef(false);
  useEffect(() => {
    if (!dongDailyNeeded || !data || visState?.datasets?.dong_daily || dongDailyLoading.current) return;
    dongDailyLoading.current = true;
    loadDongDaily(data.dongs).then((rows) => {
      setDailyBase('dong', rows);
      dispatch(addDataToMap({
        // with the industries already shown under Gu detail
        datasets: [{info: {id: 'dong_daily', label: 'Dong · daily'}, data: withIndustries(rows, 'dong')}],
        options: {centerMap: false, keepExistingConfig: true, autoCreateLayers: false}
      } as any));
    }).catch(() => { dongDailyLoading.current = false; });
  }, [dongDailyNeeded, data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const timeIdx = (visState?.filters || []).findIndex((f: any) => f.id === 'time');
  const timeDataIds: string[] = timeIdx >= 0 ? visState.filters[timeIdx].dataId : [];
  // every daily table plays with the time filter: dong_daily once it loads, and either one
  // again after an industry's column rebuilt it (replaceDataInMap)
  useEffect(() => {
    if (timeIdx < 0) return;
    const missing = ['gu_daily', 'dong_daily', 'pts_daily'].find((id) => visState?.datasets?.[id] && !timeDataIds.includes(id));
    if (!missing) return;
    // dataset and field in one action: set apart, kepler filtered once in between with no
    // field name and logged an error
    dispatch(setFilter(timeIdx, ['dataId', 'name'] as any, [missing, 'date'] as any, timeDataIds.length) as any);
  }, [datasetKeys, timeIdx, timeDataIds.join()]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 2D ↔ 3D redraws too (daily points become columns); a layer hidden in kepler's panel
  // stays hidden, on its twin too (drawSelection).
  useEffect(() => {
    if (!layersLoaded || !data || sandbox) return;
    // the store as of right now ('map' is the KeplerGl id in App.tsx)
    drawSelection(dispatch, () => store.getState().keplerGl.map.visState, {selection, linked, grain, is3d, data});
  }, [selectionKey, linked, grain, layersLoaded, data, datasetKeys, is3d, sandbox, cellView, aggregateOn, timeShow.show === 'dong']);   // eslint-disable-line react-hooks/exhaustive-deps
  const pairLayerId = (visState?.layers || []).find((l: any) => l.config.isVisible && pairKeysOf(l.id))?.id;
  // the daily pair's grid takes the colours of the playing day (see pair.ts)
  const timeValue = timeIdx >= 0 ? visState.filters[timeIdx].value?.[0] : null;
  const playDay = timeValue != null ? Math.ceil(timeValue / 86400000) : null;
  // the day on the map stays inside the period: moved to its first day when the period leaves it
  const timeDomain = timeIdx >= 0 ? visState.filters[timeIdx].domain as [number, number] | undefined : undefined;
  // (a table rebuilt over a wider span of years can come back with the day emptied: put one back)
  const timeWindow = timeIdx >= 0 ? visState.filters[timeIdx].value : null;
  const windowOk = Array.isArray(timeWindow) && timeWindow.length === 2 && Number.isFinite(timeWindow[0]);
  useEffect(() => {
    if (timeIdx < 0 || !timeDomain) return;
    const lo = Math.max(period[0], timeDomain[0]), hi = Math.min(period[1] - 86400000, timeDomain[1]);
    if (!windowOk) {
      const at = lo <= hi ? lo : timeDomain[0];
      dispatch(setFilter(timeIdx, 'value', [at, at + 86400000 - 1]) as any);
      return;
    }
    const day = Math.ceil(timeValue / 86400000) * 86400000;
    if (lo <= hi && (day < lo || day > hi)) dispatch(setFilter(timeIdx, 'value', [lo, lo + 86400000 - 1]) as any);
  }, [period[0], period[1], timeIdx, timeDomain?.[0], timeDomain?.[1], windowOk]);   // eslint-disable-line react-hooks/exhaustive-deps
  // the ruler's lines under its axis: the map's variables that have a span, each in its colour on
  // the map — the 3×3 grid's rose and teal for a pair on the flat map, else a hue of its own ramp
  const bands = useMemo(() => selection.flatMap((k, i) => {
    const x = VAR_BY_KEY[k], span = spanOf(k);
    if (!x || !span) return [];
    const ramp = colorRangeFor(x)?.colors ?? [];
    const colour = selection.length > 1 && linked && !is3d ? [BIVARIATE[2][0], BIVARIATE[0][2]][i] : ramp[Math.min(4, ramp.length - 1)];
    return colour ? [{key: k, span, colour}] : [];
  }), [selectionKey, linked, is3d]);   // eslint-disable-line react-hooks/exhaustive-deps
  const dailyGrid = (visState?.layers || []).filter((l: any) => l.config.isVisible && ['bi:', 'bc:', 'hb:', 'hc:'].some((p) => l.id.startsWith(p)))
    .map((l: any) => `${l.id}@${l.config.dataId}:${l.config.colorField?.name}`).join();
  useEffect(() => {
    if (visState && dailyGrid && !sandbox) recolourDailyPair(dispatch, store.getState().keplerGl.map.visState, {period,
      basis: timeShow.value === 'avg' && timeShow.base === 'same' ? 'day' : 'period', combine: aggregateOn ? timeShow.combine : undefined});
  }, [playDay, dailyGrid, datasetKeys, sandbox, filtersKey(visState?.filters), timeShow.value, timeShow.base, timeShow.combine, aggregateOn,
    period[0], period[1]]);   // eslint-disable-line react-hooks/exhaustive-deps
  // A single daily layer takes the time card's Value for the playing day; an aggregate its period's
  // combined values (timeModes.ts). Keyed on each layer's colour field too, so a layer drawn again
  // with kepler's own colouring is put back on ours.
  const keyOf = (prefixes: string[]) => (visState?.layers || []).filter((l: any) => l.config.isVisible && prefixes.some((p) => l.id.startsWith(p)))
    .map((l: any) => `${l.id}@${l.config.dataId}:${l.config.colorField?.name}`).join();
  const singleDaily = keyOf(['v:', 'c:', 'p:']), aggregates = keyOf(['g:', 'p:']);
  // Aggregate's table: the areas with each daily variable drawn by dong combined over the period
  // (timeModes.ts aggregateTable) — added once, replaced as the period or Combine changes
  // (built once per input: replacing the table reorders kepler's datasets, which must not rebuild it again)
  const aggBuilt = useRef('');
  const dailyLoaded = ['gu_daily', 'dong_daily'].filter((id) => visState?.datasets?.[id]).join();
  useEffect(() => {
    if (!aggregateOn || pairedNow || !data || sandbox) { aggBuilt.current = ''; return; }
    const vs = store.getState().keplerGl.map.visState;
    const vars = selection.map((k) => VAR_BY_KEY[k]).filter((x) => x && isTemporal(x) && !(pointsOf(x.key) && timeShow.show !== 'dong'));
    if (!vars.length || vars.some((x) => !vs.datasets[dataIdFor(x, grain)])) return;
    const columns = vars.map((x) => [x, combineByPlace(x, vs.datasets[dataIdFor(x, grain)], period, combineFor(x, timeShow.combine))] as [typeof x, Map<string, number>]);
    const id = aggDataIdOf(grain);
    const input = [selectionKey, grain, timeShow.combine, timeShow.show, period[0], period[1], dailyFields, !!vs.datasets[id]].join('|');
    if (input === aggBuilt.current) return;
    aggBuilt.current = input;
    const table = aggregateTable(grain === 'dong' ? (data.dong as any) : (data.gu as any), grain, columns);
    const info = {id, label: `${grain === 'dong' ? 'Dong' : 'Gu'} · period`};
    if (vs.datasets[id]) dispatch(replaceDataInMap({datasetToReplaceId: id, datasetToUse: {info, data: table} as any,
      options: {keepExistingConfig: true, centerMap: false, autoCreateLayers: false}} as any) as any);
    else dispatch(addDataToMap({datasets: [{info, data: table}], options: {centerMap: false, keepExistingConfig: true, autoCreateLayers: false}} as any));
  }, [aggregateOn, pairedNow, selectionKey, grain, timeShow.combine, timeShow.show, period[0], period[1], dailyLoaded, dailyFields, sandbox]);   // eslint-disable-line react-hooks/exhaustive-deps
  const ptsRows = POINT_DATA.map((id) => visState?.datasets?.[id]?.dataContainer?.numRows?.() ?? 0).join();
  useEffect(() => {
    if (visState && !sandbox) syncSpecks(dispatch, store.getState().keplerGl.map.visState, ptsKey, timeShow);
  }, [ptsKey, timeShow.show, ptsRows, layerCount, sandbox]);   // eslint-disable-line react-hooks/exhaustive-deps
  // vs Avg is against the places in view: the focused district's dongs, else all of Seoul
  const avgScope: Scope = grain === 'dong' && focus.level !== 'seoul' ? {prefix: focus.gu.code, name: focus.gu.name} : SEOUL_SCOPE;
  useEffect(() => {
    if (visState && singleDaily && !sandbox) recolourTimeline(dispatch, store.getState().keplerGl.map.visState, timeShow, period, avgScope);
  }, [playDay, singleDaily, datasetKeys, sandbox, timeShow.value, timeShow.base, period[0], period[1], avgScope.prefix]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (visState && aggregates && !sandbox) recolourAggregate(dispatch, store.getState().keplerGl.map.visState, timeShow, period, grain, avgScope);
  }, [aggregates, datasetKeys, sandbox, timeShow.value, timeShow.combine, period[0], period[1], grain, avgScope.prefix]);   // eslint-disable-line react-hooks/exhaustive-deps
  // (the store as of now: a pair dropped in this render's draw must not be restyled)
  useEffect(() => { if (visState && !sandbox) restylePair(dispatch, store.getState().keplerGl.map.visState, is3d); }, [is3d, pairLayerId, sandbox]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!visState || sandbox) { lastHeights.current = null; return; }
    const last = lastHeights.current;
    const heights = `${fillIds}|${splitCount}`;
    if (!last || last.is3d !== is3d || last.fillIds !== heights) sync3d(dispatch, visState, is3d);
    lastHeights.current = {is3d, fillIds: heights};
  }, [is3d, fillIds, splitCount, sandbox]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit raised heights to the zoom once the camera settles — not every frame, which
  // would rebuild the extruded layer 60 times a second during a flight.
  const elevationOwner = useRef(new Map<string, number>());
  const zoomStep = useCamera((m) => Math.round((m?.zoom ?? 0) * 4) / 4);
  const raisedKeys = (visState?.layers || []).filter((l: any) => l.config.visConfig?.enable3d).map((l: any) => l.id).join(',');
  useEffect(() => {
    if (!is3d || !visState || sandbox) return;
    const t = window.setTimeout(() => {
      const st = store.getState().keplerGl.map;   // as of now, not as of the render
      adaptElevation(dispatch, st.visState, st.mapState.zoom, elevationOwner.current);
    }, 220);
    return () => window.clearTimeout(t);
  }, [is3d, zoomStep, raisedKeys, sandbox]);   // eslint-disable-line react-hooks/exhaustive-deps

  useMotionClass(store, visState, playing);
  useUiScale();

  const sidePanelOpen = useSelector((s: any) => !!s.keplerGl.map?.uiState?.activeSidePanel);
  // kepler leaves a full-height 32px rail on screen even with its panel closed; CSS
  // hides it unless this class says the panel is open.
  useEffect(() => { document.body.classList.toggle('kepler-side-open', sidePanelOpen); }, [sidePanelOpen]);
  // Playback only matters while a daily variable is selected.
  const temporalOn = selection.some((k) => VAR_BY_KEY[k] && isTemporal(VAR_BY_KEY[k]));
  useEffect(() => { document.body.classList.toggle('has-time-widget', temporalOn); }, [temporalOn]);
  // Side by side: CSS moves kepler's split divider clear of the frost column.
  useEffect(() => { document.body.classList.toggle('kepler-split', splitCount > 0); }, [splitCount]);
  const ready = !!(data && visState?.layers);
  // a focused district shows its neighbourhood boundaries (see outline.ts)
  const outlineGu = focus.level === 'gu' ? focus.gu.code : null;
  useEffect(() => {
    if (!ready) return;
    showDongOutline(dispatch, store.getState().keplerGl.map.visState, data!, sandbox ? null : outlineGu);
  }, [ready, outlineGu, datasetKeys, sandbox]);   // eslint-disable-line react-hooks/exhaustive-deps
  // into and out of the sandbox
  const wasSandbox = useRef(false);
  useEffect(() => {
    if (!ready || sandbox === wasSandbox.current) return;
    wasSandbox.current = sandbox;
    document.body.classList.toggle('sandbox', sandbox);
    const get = () => store.getState().keplerGl.map.visState;
    if (sandbox) {
      setPlaying(false); setDashboardOpen(false); setSettingsOpen(false);
      enterSandbox(dispatch, get);
    } else {
      leaveSandbox(dispatch, get);
    }
  }, [ready, sandbox]);   // eslint-disable-line react-hooks/exhaustive-deps
  // a variable that leaves the selection takes its filter with it
  useEffect(() => {
    setRanges((cur) => (Object.keys(cur).every((k) => selection.includes(k)) ? cur
      : Object.fromEntries(Object.entries(cur).filter(([k]) => selection.includes(k)))));
  }, [selectionKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  // a filter on a place's own value reaches the daily rows too: the value joins those tables
  // (joinStatic), and the filter then spans them (syncOurFilters rebuilds it for the new tables)
  useEffect(() => {
    if (!data) return;
    let joined = false;
    for (const key of Object.keys(ranges)) {
      const x = VAR_BY_KEY[key];
      if (x && !isTemporal(x)) joined = joinStatic(key, {gu: data.gu as any, dong: data.dong as any}) || joined;
    }
    if (joined) refreshDailyTables();
  }, [Object.keys(ranges).join(), data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const rangesKey = JSON.stringify(ranges);
  useEffect(() => {
    if (!ready || sandbox) return;
    syncOurFilters(dispatch, () => store.getState().keplerGl.map.visState, ranges);
  }, [ready, rangesKey, datasetKeys, sandbox]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Time, larger: kepler's own playback widget — its chart with a chosen y-axis and plot
  // type, the window and its handles, speeds — in place of our time card. It is kepler's
  // filter view: 'enlarged' shows it; its own minify button gives the card back.
  // kepler opens a time filter enlarged whatever the saved config says, so the view alone
  // cannot tell: the card asks for it (timeBig), and the view is set back to minified otherwise.
  const [timeBig, setTimeBig] = useState(false);
  const timeView = timeIdx >= 0 ? visState.filters[timeIdx].view : null;
  useEffect(() => {
    if (timeIdx >= 0 && !timeBig && timeView === 'enlarged') dispatch(setFilterView(timeIdx, 'minified') as any);
    if (timeBig && timeView && timeView !== 'enlarged') setTimeBig(false);   // kepler's own minify button
  }, [timeIdx, timeView, timeBig]);   // eslint-disable-line react-hooks/exhaustive-deps
  const timeExpanded = timeBig && timeView === 'enlarged';
  useEffect(() => { document.body.classList.toggle('time-expanded', timeExpanded && !sandbox); }, [timeExpanded, sandbox]);
  const expandTime = () => {
    setPlaying(false);
    setTimeBig(true);
    if (timeIdx < 0) return;
    dispatch(setFilterView(timeIdx, 'enlarged') as any);
    // its chart starts as the playing variable over the year for all of Seoul (a line of
    // the district rows, summed or averaged as the variable is) — its default, a count of
    // rows per day, is the same every day. Its own Y-axis menu changes it from there.
    const x = selection.map((key) => VAR_BY_KEY[key]).find((v) => v && isTemporal(v));
    const filter = visState.filters[timeIdx];
    const field = x && visState.datasets[filter.dataId[0]]?.fields.find((f: any) => f.name === x.key);
    if (field && !filter.yAxis) {
      dispatch(setFilterPlot(timeIdx, {yAxis: field} as any) as any);
      dispatch(setFilterPlot(timeIdx, {plotType: {type: 'lineChart', interval: '1-day', aggregation: x!.how === 'sum' ? 'sum' : 'average',
        colorsByDataId: {gu_daily: '#e8a35c', dong_daily: '#7dbccc'}}} as any) as any);
    }
  };
  // the light: blending and kepler's effects follow the switches and the 2D/3D mode; the
  // halos follow their bubble layers — and the day, as the bubbles are recoloured daily
  const fxKey = JSON.stringify(fx);
  const bubbleKey = (visState?.layers || []).filter((l: any) => l.type === 'point' && l.config.isVisible && !isHaloId(l.id))
    .map((l: any) => `${l.id}@${l.config.dataId}:${l.config.colorField?.name}:${l.config.sizeField?.name}`).join();
  // (bubbleKey too: on the flat map the glow is on only while bubbles are — effects.ts)
  useEffect(() => {
    if (ready && !sandbox) syncEffects(dispatch, store.getState().keplerGl.map.visState, fx, is3d);
  }, [ready, fxKey, is3d, sandbox, bubbleKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  // (and which half of a split map each bubble layer is on: its halo goes with it)
  const halvesKey = (visState?.splitMaps || []).map((m: any) => Object.keys(m.layers || {})
    .filter((id) => m.layers[id] && !isHaloId(id)).sort().join('+')).join('|');
  useEffect(() => {
    if (ready) syncHalos(dispatch, () => store.getState().keplerGl.map.visState, fx.halo && !sandbox);
  }, [ready, bubbleKey, halvesKey, fx.halo, playDay, sandbox]);   // eslint-disable-line react-hooks/exhaustive-deps
  // the basemap and map switches remembered from Settings, once the map is up
  const restored = useRef(false);
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    restoreSettings(dispatch, store.getState().keplerGl.map);
  }, [ready]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`overlay blur-${BLUR_MODE}`}>
      {/* Frosted column behind the Focus text: blurs and darkens only the map under it,
          fading out at the edges so it reads as no box at all. It must be the FIRST
          child — painted later, it frosted the top bar too and swallowed the tabs. */}
      {ready && !sidePanelOpen && !sandbox && <div className="focus-frost" aria-hidden />}
      <TopBar onRecenter={focusSeoul} is3d={is3d} onToggle3d={toggle3d} onClean={enterClean} only={onlyProject} onOnly={setOnlyProject}
        search={<SearchBox data={data} selection={selection} onGu={focusGu} onDong={focusDong} onVariable={(k) => select(k, 'main')} />} />
      {clean && (
        <button className="clean-exit" onClick={() => setClean(false)}>
          <X size={14} strokeWidth={2} aria-hidden />Exit clean mode<kbd>Esc</kbd>
        </button>
      )}
      <SideRail page={page} onPage={(p) => { setPage(p); if (p === 'map') setDashboardOpen(false); }}
        dashboardOpen={dashboardOpen} onDashboard={() => { if (page !== 'map') { setPage('map'); setDashboardOpen(true); } else setDashboardOpen((v) => !v); }}
        settingsOpen={settingsOpen} onSettings={() => setSettingsOpen((v) => !v)} />
      {settingsOpen && <SettingsPanel onClose={closeSettings} annotations={annotations} onAnnotations={setAnnotations}
        fx={fx} onFx={setFx} />}
      {ready && <MapAnnotations data={data!} show={annotations} />}
      {/* the zoom and a distance scale come with the hex grid, to say where it starts */}
      {ready && annotations.hexFar && !sandbox && <MapScale />}
      {/* kepler's settings panel opens on the left, where the Focus block sits, so the
          block steps aside while it is open instead of the two overlapping. */}
      {sandbox && <SandboxBar onBack={() => setPage('map')} />}
      {ready && !sidePanelOpen && !sandbox && (
        <FocusBlock data={data!} focus={focus} onSeoul={focusSeoul} onGu={focusGu} onDong={focusDong}
          grain={grain} onGrain={setGrain} selection={selection} linked={linked}
          pairable={planFor(selection, linked, grain).pairable} onLink={() => setLinked((v) => !v)}
          ranges={ranges} onRange={setRange} onSelect={select} />
      )}
      {ready && !sandbox && (
        <GraphCard data={data!} focus={focus} selection={selection} linked={linked} grain={grain} is3d={is3d} playing={playing}
          onOpenDashboard={() => setDashboardOpen(true)}
          onPick={(level, code) => {
            if (level === 'dong') { const d = data!.dongs.find((x) => x.code === code); if (d) focusDong(d); }
            else { const g = data!.gus.find((x) => x.code === code); if (g) focusGu(g); }
          }} />
      )}
      {ready && temporalOn && !sandbox && !timeExpanded && (
        <TimeCard focus={focus} selection={selection} linked={linked} is3d={is3d} grain={grain} playing={playing}
          period={period} onPlaying={setPlaying} onExpand={expandTime}
          view={timeShow} onView={setTimeShow} aggregateOn={aggregateOn} paired={pairedNow} scopeName={avgScope.name} />
      )}
      {ready && !sandbox && <Drawer focus={focus} grain={grain} headline={headline} setHeadline={setHeadline} selection={selection} onSelect={select}
        only={onlyProject} onOnly={setOnlyProject}
        period={period} onPeriod={setPeriod} day={playDay != null ? playDay * 86400000 : null} bands={bands}
        loading={Object.values(industryLoading).filter(Boolean) as string[]} />}
      {ready && dashboardOpen && !sandbox && (
        <Dashboard data={data!} focus={focus} selection={selection} linked={linked} grain={grain} is3d={is3d} playing={playing} only={onlyProject}
          onSelect={select} onClose={() => setDashboardOpen(false)}
          onPick={(level, code) => {
            if (level === 'dong') { const d = data!.dongs.find((x) => x.code === code); if (d) focusDong(d); }
            else { const g = data!.gus.find((x) => x.code === code); if (g) focusGu(g); }
          }} />
      )}
      {ready && !sandbox && <StatusBar selection={selection} />}
      {page === 'data' && <DataPage selection={selection} onSelect={select} onClose={closePage} only={onlyProject} />}
      {page === 'about' && <AboutPage onClose={closePage} />}
    </div>
  );
}

// A close handler that keeps one identity, so a page's Escape listener is not re-bound
// on every render of the overlay.
function useStableClose(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  return useMemo(() => () => ref.current(), []);
}

// A clicked polygon focuses its place: a dong under Dong detail, a district under Gu.
// kepler keeps the source row index on the picked feature; that leads back to the code.
function pickedPlace(clicked: any, visState: any): {level: 'dong' | 'gu'; code: string} | null {
  // a bubble's halo stands for its bubble
  const layerId: string = clicked?.layer?.id?.startsWith('halo:') ? clicked.layer.id.slice(5) : clicked?.layer?.id;
  if (!layerId || !(varOfLayerId(layerId) || pairKeysOf(layerId))) return null;
  // the deck layer carries kepler's layer id; kepler's layer knows which dataset it draws
  const dataId = visState?.layers?.find((l: any) => l.id === layerId)?.config.dataId;
  const level = ({dong: 'dong', dong_pair: 'dong', dong_daily: 'dong', dong_cells: 'dong', gu: 'gu', gu_pair: 'gu', gu_cells: 'gu'} as Record<string, 'dong' | 'gu'>)[dataId] ?? null;
  const datasets = visState?.datasets;
  if (!level) return null;
  const key = level === 'dong' ? 'dong_code' : 'gu_code';
  const fromProps = clicked.object?.properties?.[key];
  if (fromProps) return {level, code: String(fromProps)};
  const dataset = datasets?.[dataId];
  // a polygon keeps its row in properties.index, a point in object.index
  const row = clicked.object?.properties?.index ?? clicked.object?.index ?? clicked.index;
  const fieldIdx = dataset ? dataset.fields.findIndex((f: any) => f.name === key) : -1;
  if (row == null || fieldIdx < 0) return null;
  return {level, code: String(dataset.dataContainer.valueAt(row, fieldIdx))};
}

// Marks <body> while the camera moves or time plays (used by ?blur=motion).
// (the camera is watched on the store, not rendered with: see Overlay)
function useMotionClass(store: any, visState: any, playing: boolean) {
  const animating = useMemo(
    () => playing || !!visState?.filters?.some((f: any) => f.isAnimating),
    [visState?.filters, playing]
  );
  const animatingRef = useRef(animating);
  animatingRef.current = animating;
  useEffect(() => {
    const view = () => {
      const m = store.getState().keplerGl.map?.mapState;
      return m ? [m.latitude, m.longitude, m.zoom, m.pitch, m.bearing].join() : '';
    };
    let last = view(), t = 0;
    const unsubscribe = store.subscribe(() => {
      const now = view();
      if (now === last) return;
      last = now;
      document.body.classList.add('map-moving');
      window.clearTimeout(t);
      t = window.setTimeout(() => { if (!animatingRef.current) document.body.classList.remove('map-moving'); }, 180);
    });
    return () => { unsubscribe(); window.clearTimeout(t); };
  }, [store]);
  useEffect(() => {
    document.body.classList.toggle('map-moving', animating);
  }, [animating]);
}
