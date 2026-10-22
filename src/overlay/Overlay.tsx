import {useEffect, useMemo, useRef, useState} from 'react';
import {useDispatch, useStore} from 'react-redux';
import {cancelFlight, flyToBounds, flyToView} from './flyTo';
import type {Bounds, Place, UhusData} from '../data/uhus';
import {SEOUL_VIEW, INITIAL_ON_MAP} from '../data/mapConfig';
import {THEMES, VAR_BY_KEY, isTemporal, varOfLayerId, varsOf, type ThemeKey} from '../data/catalog';
import {loadDongDaily} from '../data/uhus';
import {useKepler} from './useKepler';
import {addDataToMap, setFilter, togglePerspective} from '@kepler.gl/actions';
import {adaptElevation, drawSelection, layersOnMap, nextSelection, planFor, restylePair, sync3d, syncOrder,
  syncTooltip, type Grain} from './layers';
import {pairKeysOf} from './pair';
import TopBar, {type PageId} from './TopBar';
import FocusBlock from './FocusBlock';
import GraphCard from './GraphCard';
import Drawer from './Drawer';
import TimeCard from './TimeCard';
import Dashboard from './dashboard/Dashboard';
import SettingsPanel, {restoreSettings} from './SettingsPanel';
import DataPage from './pages/DataPage';
import AboutPage from './pages/AboutPage';
import {useUiScale} from './uiScale';

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
  // daily playback (the time card steps day by day; see TimeCard)
  const [playing, setPlaying] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  // the top bar's other tabs: a page covering the map (Data, About), and the settings panel
  const [page, setPage] = useState<PageId>('map');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closePage = useStableClose(() => setPage('map'));
  const closeSettings = useStableClose(() => setSettingsOpen(false));
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

  // Grabbing the map mid-flight hands control back to the user instead of fighting them.
  useEffect(() => {
    const grab = (e: PointerEvent) => { if ((e.target as Element)?.closest?.('.kepler-gl')) cancelFlight(); };
    window.addEventListener('pointerdown', grab, true);
    return () => window.removeEventListener('pointerdown', grab, true);
  }, []);

  // Clicking a neighbourhood on the map focuses it (feature 2).
  const clicked = visState?.clicked;
  useEffect(() => {
    if (!clicked || !data) return;
    const picked = pickedPlace(clicked, visState);
    if (picked?.level === 'dong') { const d = data.dongs.find((x) => x.code === picked.code); if (d) focusDong(d); }
    if (picked?.level === 'gu') { const g = data.gus.find((x) => x.code === picked.code); if (g) focusGu(g); }
    // focusDong is recreated each render; the click is the only real trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clicked, data]);

  // Keep the hover tooltip listing exactly the variables that are on the map, and the
  // daily points stacked over the area layers.
  const onMapKeys = layersOnMap(visState).map((x) => `${x.layer.id}@${x.layer.config.dataId}`).join(',');
  useEffect(() => { if (visState) syncTooltip(dispatch, visState); }, [onMapKeys]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Stacking is set when a layer is created (kepler puts new ones on top), so an order
  // dragged in kepler's panel holds until the next new layer.
  const layerCount = visState?.layers?.length ?? 0;
  useEffect(() => { if (visState) syncOrder(dispatch, visState); }, [layerCount]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 2D / 3D. kepler's own dragRotate flag is the single source of truth (its perspective
  // toggle tilts to 50° and rotates 24°). Heights are set when the mode switches or a
  // different area layer comes on — not on every change, so a height turned off in
  // kepler's panel stays off.
  const is3d = !!kepler?.mapState?.dragRotate;
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
    const rest = [selectionKey, linked, grain, datasetKeys].join('|');
    const modeOnly = lastDraw.current === rest;
    lastDraw.current = rest;
    // the store as of right now ('map' is the KeplerGl id in App.tsx)
    drawSelection(dispatch, () => store.getState().keplerGl.map.visState, {selection, linked, grain, is3d, data, modeOnly});
  }, [selectionKey, linked, grain, layersLoaded, data, datasetKeys, is3d]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pairLayerId = (visState?.layers || []).find((l: any) => l.config.isVisible && pairKeysOf(l.id))?.id;
  useEffect(() => { if (visState) restylePair(dispatch, visState, is3d); }, [is3d, pairLayerId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!visState) return;
    const last = lastHeights.current;
    const heights = `${fillIds}|${splitCount}`;
    if (!last || last.is3d !== is3d || last.fillIds !== heights) sync3d(dispatch, visState, is3d);
    lastHeights.current = {is3d, fillIds: heights};
  }, [is3d, fillIds, splitCount]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit raised heights to the zoom once the camera settles — not every frame, which
  // would rebuild the extruded layer 60 times a second during a flight.
  const elevationOwner = useRef(new Map<string, number>());
  const zoomStep = Math.round((kepler?.mapState?.zoom ?? 0) * 4) / 4;
  const raisedKeys = (visState?.layers || []).filter((l: any) => l.config.visConfig?.enable3d).map((l: any) => l.id).join(',');
  useEffect(() => {
    if (!is3d || !visState) return;
    const t = window.setTimeout(() => {
      const st = store.getState().keplerGl.map;   // as of now, not as of the render
      adaptElevation(dispatch, st.visState, st.mapState.zoom, elevationOwner.current);
    }, 220);
    return () => window.clearTimeout(t);
  }, [is3d, zoomStep, raisedKeys]);   // eslint-disable-line react-hooks/exhaustive-deps

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
      {ready && !sidePanelOpen && <div className="focus-frost" aria-hidden />}
      <TopBar onRecenter={focusSeoul} is3d={is3d} onToggle3d={toggle3d}
        page={page} onPage={(p) => { setPage(p); if (p === 'map') setDashboardOpen(false); }}
        dashboardOpen={dashboardOpen} onDashboard={() => { if (page !== 'map') { setPage('map'); setDashboardOpen(true); } else setDashboardOpen((v) => !v); }}
        settingsOpen={settingsOpen} onSettings={() => setSettingsOpen((v) => !v)} />
      {settingsOpen && <SettingsPanel onClose={closeSettings} />}
      {/* kepler's settings panel opens on the left, where the Focus block sits, so the
          block steps aside while it is open instead of the two overlapping. */}
      {ready && !sidePanelOpen && (
        <FocusBlock data={data!} focus={focus} onSeoul={focusSeoul} onGu={focusGu} onDong={focusDong}
          grain={grain} onGrain={setGrain} selection={selection} linked={linked}
          pairable={planFor(selection, linked, grain).pairable} onLink={() => setLinked((v) => !v)} />
      )}
      {ready && (
        <GraphCard data={data!} focus={focus} selection={selection} linked={linked} grain={grain} is3d={is3d} playing={playing}
          onOpenDashboard={() => setDashboardOpen(true)}
          onPick={(level, code) => {
            if (level === 'dong') { const d = data!.dongs.find((x) => x.code === code); if (d) focusDong(d); }
            else { const g = data!.gus.find((x) => x.code === code); if (g) focusGu(g); }
          }} />
      )}
      {ready && temporalOn && <TimeCard focus={focus} selection={selection} grain={grain} playing={playing} onPlaying={setPlaying} />}
      {ready && <Drawer focus={focus} grain={grain} headline={headline} setHeadline={setHeadline} selection={selection} onSelect={select} />}
      {ready && dashboardOpen && (
        <Dashboard data={data!} focus={focus} selection={selection} linked={linked} grain={grain} is3d={is3d} playing={playing}
          onSelect={select} onClose={() => setDashboardOpen(false)}
          onPick={(level, code) => {
            if (level === 'dong') { const d = data!.dongs.find((x) => x.code === code); if (d) focusDong(d); }
            else { const g = data!.gus.find((x) => x.code === code); if (g) focusGu(g); }
          }} />
      )}
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
  if (!clicked?.layer || !(varOfLayerId(clicked.layer.id) || pairKeysOf(clicked.layer.id))) return null;
  // the deck layer carries kepler's layer id; kepler's layer knows which dataset it draws
  const dataId = visState?.layers?.find((l: any) => l.id === clicked.layer.id)?.config.dataId;
  const level = ({dong: 'dong', dong_pair: 'dong', dong_daily: 'dong', gu: 'gu', gu_pair: 'gu'} as Record<string, 'dong' | 'gu'>)[dataId] ?? null;
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
