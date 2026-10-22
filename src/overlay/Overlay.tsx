import {useEffect, useMemo, useRef, useState} from 'react';
import {X} from 'lucide-react';
import {useDispatch, useStore} from 'react-redux';
import {cancelFlight, flyToBounds, flyToView} from './flyTo';
import type {Bounds, Place, UhusData} from '../data/uhus';
import {SEOUL_VIEW, INITIAL_ON_MAP} from '../data/mapConfig';
import {THEMES, VAR_BY_KEY, isTemporal, varOfLayerId, varsOf, type ThemeKey} from '../data/catalog';
import {loadDongDaily} from '../data/uhus';
import {useKepler} from './useKepler';
import {addDataToMap, onLayerClick, setFilter, setFilterPlot, setFilterView, togglePerspective} from '@kepler.gl/actions';
import {adaptElevation, drawSelection, layersOnMap, nextSelection, planFor, restylePair, setCellView, sync3d, syncOrder,
  syncTooltip, type Grain} from './layers';
import {pairKeysOf, recolourDailyPair} from './pair';
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
import {ourFiltersKey, syncOurFilters, type Ranges} from './ourFilters';
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
  const kepler = useKepler();
  const visState = kepler?.visState;
  const [focus, setFocus] = useState<Focus>({level: 'seoul'});
  const [grain, setGrainState] = useState<Grain>('dong');
  // What the map is about: up to two variables, linked from the drawer (🔗). Two of a
  // kind are shown on one shared layer (linked, the default) or ⛓ side by side.
  const [selection, setSelection] = useState<string[]>(INITIAL_ON_MAP);
  const select = (key: string) => setSelection((s) => nextSelection(s, key));
  const [linked, setLinked] = useState(true);
  // the atlas's own filters: a value range per selected variable (ourFilters.ts)
  const [ranges, setRanges] = useState<Ranges>({});
  const setRange = (key: string, r: [number, number] | null) =>
    setRanges((cur) => { const next = {...cur}; if (r) next[key] = r; else delete next[key]; return next; });
  // daily playback (the time card steps day by day; see TimeCard)
  const [playing, setPlaying] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
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
  const setHeadline = (theme: ThemeKey, key: string) => setHeadlineState((h) => ({...h, [theme]: key}));

  const flyTo = (bounds: Bounds) => kepler?.mapState && flyToBounds(dispatch, kepler.mapState, bounds);
  const focusSeoul = () => { setFocus({level: 'seoul'}); if (kepler?.mapState) flyToView(dispatch, kepler.mapState, SEOUL_VIEW); };
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

  // Clicking a neighbourhood on the map focuses it (feature 2).
  const clicked = visState?.clicked;
  useEffect(() => {
    if (!clicked || !data || sandbox) return;
    const picked = pickedPlace(clicked, visState);
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
  const is3d = !!kepler?.mapState?.dragRotate;
  // 3D from afar: the areas as a flat hex grid (layers.ts cellView) — below zoom 8.8, and
  // once in it, back to the areas only from 9.0, so it does not flicker at the edge.
  // Settings → Map layers switches it off.
  const cellRef = useRef(false);
  const zoomNow = kepler?.mapState?.zoom ?? 0;
  cellRef.current = annotations.hexFar && (cellRef.current ? zoomNow < 9.0 : zoomNow < 8.8);
  setCellView(cellRef.current);
  const cellView = is3d && cellRef.current;
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
    loadDongDaily(data.dongs).then((rows) => dispatch(addDataToMap({
      datasets: [{info: {id: 'dong_daily', label: 'Dong · daily'}, data: rows}],
      options: {centerMap: false, keepExistingConfig: true, autoCreateLayers: false}
    } as any))).catch(() => { dongDailyLoading.current = false; });
  }, [dongDailyNeeded, data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const timeIdx = (visState?.filters || []).findIndex((f: any) => f.id === 'time');
  const timeDataIds: string[] = timeIdx >= 0 ? visState.filters[timeIdx].dataId : [];
  useEffect(() => {
    if (timeIdx < 0 || !visState?.datasets?.dong_daily || timeDataIds.includes('dong_daily')) return;
    // dataset and field in one action: set apart, kepler filtered once in between with no
    // field name and logged an error
    dispatch(setFilter(timeIdx, ['dataId', 'name'] as any, ['dong_daily', 'date'] as any, timeDataIds.length) as any);
  }, [datasetKeys, timeIdx]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 2D ↔ 3D redraws too (daily points become columns); when only the mode changed,
  // drawSelection keeps a layer hidden in kepler's panel hidden on its twin.
  const lastDraw = useRef('');
  useEffect(() => {
    if (!layersLoaded || !data) return;
    if (sandbox) { lastDraw.current = ''; return; }   // back from the sandbox: a full redraw
    const rest = [selectionKey, linked, grain, datasetKeys].join('|');
    const modeOnly = lastDraw.current === rest;
    lastDraw.current = rest;
    // the store as of right now ('map' is the KeplerGl id in App.tsx)
    drawSelection(dispatch, () => store.getState().keplerGl.map.visState, {selection, linked, grain, is3d, data, modeOnly});
  }, [selectionKey, linked, grain, layersLoaded, data, datasetKeys, is3d, sandbox, cellView]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pairLayerId = (visState?.layers || []).find((l: any) => l.config.isVisible && pairKeysOf(l.id))?.id;
  // the daily pair's grid takes the colours of the playing day (see pair.ts)
  const timeValue = timeIdx >= 0 ? visState.filters[timeIdx].value?.[0] : null;
  const playDay = timeValue != null ? Math.ceil(timeValue / 86400000) : null;
  const dailyGrid = (visState?.layers || []).filter((l: any) => l.config.isVisible && ['bi:', 'bc:', 'hb:', 'hc:'].some((p) => l.id.startsWith(p)))
    .map((l: any) => `${l.id}@${l.config.dataId}:${l.config.colorField?.name}`).join();
  useEffect(() => {
    if (visState && dailyGrid && !sandbox) recolourDailyPair(dispatch, store.getState().keplerGl.map.visState);
  }, [playDay, dailyGrid, datasetKeys, sandbox, ourFiltersKey(visState?.filters)]);   // eslint-disable-line react-hooks/exhaustive-deps
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
  const zoomStep = Math.round((kepler?.mapState?.zoom ?? 0) * 4) / 4;
  const raisedKeys = (visState?.layers || []).filter((l: any) => l.config.visConfig?.enable3d).map((l: any) => l.id).join(',');
  useEffect(() => {
    if (!is3d || !visState || sandbox) return;
    const t = window.setTimeout(() => {
      const st = store.getState().keplerGl.map;   // as of now, not as of the render
      adaptElevation(dispatch, st.visState, st.mapState.zoom, elevationOwner.current);
    }, 220);
    return () => window.clearTimeout(t);
  }, [is3d, zoomStep, raisedKeys, sandbox]);   // eslint-disable-line react-hooks/exhaustive-deps

  useMotionClass(kepler, playing);
  useUiScale();

  const sidePanelOpen = !!kepler?.uiState?.activeSidePanel;
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
  useEffect(() => {
    if (ready) syncHalos(dispatch, () => store.getState().keplerGl.map.visState, fx.halo && !sandbox);
  }, [ready, bubbleKey, fx.halo, playDay, sandbox]);   // eslint-disable-line react-hooks/exhaustive-deps
  // the basemap and map switches remembered from Settings, once the map is up
  const restored = useRef(false);
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    restoreSettings(dispatch, kepler);
  }, [ready]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`overlay blur-${BLUR_MODE}`}>
      {/* Frosted column behind the Focus text: blurs and darkens only the map under it,
          fading out at the edges so it reads as no box at all. It must be the FIRST
          child — painted later, it frosted the top bar too and swallowed the tabs. */}
      {ready && !sidePanelOpen && !sandbox && <div className="focus-frost" aria-hidden />}
      <TopBar onRecenter={focusSeoul} is3d={is3d} onToggle3d={toggle3d} onClean={enterClean}
        search={<SearchBox data={data} selection={selection} onGu={focusGu} onDong={focusDong} onVariable={select} />} />
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
          ranges={ranges} onRange={setRange} />
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
        <TimeCard focus={focus} selection={selection} grain={grain} playing={playing} onPlaying={setPlaying} onExpand={expandTime} />
      )}
      {ready && !sandbox && <Drawer focus={focus} grain={grain} headline={headline} setHeadline={setHeadline} selection={selection} onSelect={select} />}
      {ready && dashboardOpen && !sandbox && (
        <Dashboard data={data!} focus={focus} selection={selection} linked={linked} grain={grain} is3d={is3d} playing={playing}
          onSelect={select} onClose={() => setDashboardOpen(false)}
          onPick={(level, code) => {
            if (level === 'dong') { const d = data!.dongs.find((x) => x.code === code); if (d) focusDong(d); }
            else { const g = data!.gus.find((x) => x.code === code); if (g) focusGu(g); }
          }} />
      )}
      {ready && !sandbox && <StatusBar selection={selection} />}
      {page === 'data' && <DataPage selection={selection} onSelect={select} onClose={closePage} />}
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
function useMotionClass(kepler: any, playing: boolean) {
  const m = kepler?.mapState;
  const animating = useMemo(
    () => playing || !!kepler?.visState?.filters?.some((f: any) => f.isAnimating),
    [kepler?.visState?.filters, playing]
  );
  useEffect(() => {
    if (!m) return;
    document.body.classList.add('map-moving');
    const t = setTimeout(() => { if (!animating) document.body.classList.remove('map-moving'); }, 180);
    return () => clearTimeout(t);
  }, [m?.latitude, m?.longitude, m?.zoom, m?.pitch, m?.bearing, animating]);
  useEffect(() => {
    document.body.classList.toggle('map-moving', animating);
  }, [animating]);
}
