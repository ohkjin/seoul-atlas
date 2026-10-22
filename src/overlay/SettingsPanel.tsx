import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useDispatch, useStore} from 'react-redux';
import {interactionConfigChange, mapConfigChange, mapStyleChange, toggleModal} from '@kepler.gl/actions';
import {EXPORT_DATA_ID, EXPORT_IMAGE_ID, EXPORT_MAP_ID, NO_MAP_ID} from '@kepler.gl/constants';
import {Download, FileCode2, Image, SlidersHorizontal} from 'lucide-react';
import {useKepler} from './useKepler';
import {openMapSettings} from './layers';
import {uiZoom} from './uiScale';
import type {Annotations} from './MapAnnotations';
import {FX_DEFAULT, type Fx, type Look3d} from './effects';
import lookGlow from '../assets/look-glow.jpg';
import lookSolid from '../assets/look-solid.jpg';

// The basemaps that need no Mapbox token (the app runs without one), in this order.
const BASEMAPS: [string, string][] = [['dark-matter', 'Dark'], ['positron', 'Light'], ['voyager', 'Streets'], [NO_MAP_ID, 'None']];
// kepler's map interactions worth a switch. Place search (geocoder) is left out: it
// queries Mapbox and needs a token.
const INTERACTIONS: [string, string, string][] = [
  ['tooltip', 'Hover tooltip', 'Values of the place under the cursor'],
  ['brush', 'Brush', 'Highlight only what is near the cursor'],
  ['coordinate', 'Coordinates', 'Show the latitude and longitude under the cursor'],
];
// The basemap's own layer groups (kepler's: matched by the style's layer ids).
const GROUPS: [string, string][] = [['label', 'Labels'], ['road', 'Roads'], ['building', 'Buildings'], ['border', 'Borders']];
// The basemap's labels start off: they name the towns and neighbourhoods around Seoul
// (Goyang, Guri, every -ri and -dong), and Seoul's own gu and dong names are ours.
const GROUP_DEFAULTS: Record<string, boolean> = {label: false};
// Ours, drawn over the map (MapAnnotations).
const OURS: [keyof Annotations, string, string][] = [
  ['names', 'Gu · dong names', 'Districts on the whole city, neighbourhoods when zoomed in'],
  ['boundaries', 'Gu · dong boundaries', 'Dashed outlines; neighbourhoods when zoomed in'],
  // the hex grid from afar (layers.ts cellView) is off for now; this line brings its switch back:
  // ['hexFar', 'Hex grid from afar (3D)', 'Below zoom 8.8 the areas lie down as a flat hex grid'],
];
// The night-city light (effects.ts): one of two looks for 3D, each shown by a capture of
// the real map, and the bubbles' halos.
const LOOKS: [Look3d, string, string, string][] = [
  ['glow', 'Glow', 'Overlaps add up to light', lookGlow],
  ['solid', 'Solid', 'Each area in its own colour', lookSolid],
];
const STORE_KEY = 'seoul-atlas.settings';
// The panel's two tabs (mockups/settings-tabs.html): how the map looks, and what to do with
// it. One at a time under the tabs at the top; it reopens on the last one.
type Tab = 'display' | 'tools';
const TABS: [Tab, string][] = [['display', 'Display'], ['tools', 'Data & Tools']];
let lastTab: Tab = 'display';

// The remembered 3D look and halo switch (the defaults where nothing, or the earlier
// glow/light/vignette switches, was saved).
export function rememberedFx(): Fx {
  let saved: Record<string, any> = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { /* storage off */ }
  const fx = saved.fx || {};
  return {
    look3d: LOOKS.some(([id]) => id === fx.look3d) ? fx.look3d : FX_DEFAULT.look3d,
    halo: typeof fx.halo === 'boolean' ? fx.halo : FX_DEFAULT.halo
  };
}

// The basemap's layer groups as they should be: kepler's current ones, our defaults over
// them, and what was switched in Settings over those.
function wantedGroups(current: Record<string, boolean>) {
  let saved: Record<string, any> = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { /* storage off */ }
  const groups = saved.groups && typeof saved.groups === 'object' ? saved.groups : {};
  return {...current, ...GROUP_DEFAULTS, ...groups};
}

// The remembered switches for the names and boundaries over the map (on unless turned off).
export function rememberedAnnotations(): Annotations {
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { /* storage off */ }
  // hexFar: off for now, whatever was remembered (see OURS)
  return {names: saved.names !== false, boundaries: saved.boundaries !== false, hexFar: false};
}

// Settings: a glass panel beside the rail's Settings tab, in two tabs, in the app's own
// style, for what kepler can do but the app keeps out of sight — the basemap and its
// layers, the gu and dong names and boundaries drawn over the map, the map's hover
// interactions, and exporting the map or its data (kepler's own export dialogs).
// The detailed per-layer settings stay behind the ⚙ on the first map card; the button
// at the bottom opens them too. Basemap and switches are remembered in this browser.
type Props = {onClose: () => void; annotations: Annotations; onAnnotations: (a: Annotations) => void;
  fx: Fx; onFx: (fx: Fx) => void};
export default function SettingsPanel({onClose, annotations, onAnnotations, fx, onFx}: Props) {
  const dispatch = useDispatch();
  const store = useStore<any>();
  const kepler = useKepler();
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTabState] = useState<Tab>(lastTab);
  const setTab = (t: Tab) => { lastTab = t; setTabState(t); };
  const styleType = kepler?.mapStyle?.styleType;
  const available = kepler?.mapStyle?.mapStyles || {};
  const interaction = kepler?.visState?.interactionConfig || {};
  const visibleGroups = kepler?.mapStyle?.visibleLayerGroups || {};
  const groupsHere = new Set((available[styleType]?.layerGroups || []).map((g: any) => g.slug));
  // opens beside the Settings tab in the rail, its top level with the tab's, and runs down
  // no further than the status bar (scrolling inside if the screen is short)
  const [at, setAt] = useState<{left: number; top: number; maxHeight: number} | null>(null);
  useLayoutEffect(() => {
    const r = document.querySelector('[data-settings-tab]')?.getBoundingClientRect();
    const z = uiZoom();   // screen pixels → the zoomed overlay's pixels
    const floor = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) + 16;
    if (r) setAt({left: r.right / z + 14, top: r.top / z, maxHeight: window.innerHeight / z - r.top / z - floor});
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // a click anywhere else closes it — but not the Settings tab itself, which toggles it
    const away = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!root.current?.contains(t) && !t.closest?.('[data-settings-tab]')) onClose();
    };
    window.addEventListener('keydown', esc);
    window.addEventListener('pointerdown', away, true);
    return () => { window.removeEventListener('keydown', esc); window.removeEventListener('pointerdown', away, true); };
  }, [onClose]);

  // a new basemap comes with its own group defaults; ours and the remembered ones go back on
  const setBasemap = (id: string) => {
    dispatch(mapStyleChange(id) as any);
    dispatch(mapConfigChange({visibleLayerGroups: wantedGroups(store.getState().keplerGl.map.mapStyle.visibleLayerGroups || {})} as any) as any);
    remember({basemap: id});
  };
  const toggle = (id: string) => {
    const cur = interaction[id];
    if (!cur) return;
    dispatch(interactionConfigChange({...cur, enabled: !cur.enabled}) as any);
    remember({[id]: !cur.enabled});
  };
  const open = (id: string) => { dispatch(toggleModal(id) as any); onClose(); };
  const toggleGroup = (slug: string) => {
    // the store as of now: two quick clicks would otherwise both start from the same render
    const cur = store.getState().keplerGl.map.mapStyle.visibleLayerGroups || {};
    const next = {...cur, [slug]: !cur[slug]};
    dispatch(mapConfigChange({visibleLayerGroups: next} as any) as any);
    remember({groups: next});
  };
  const setFx = (patch: Partial<Fx>) => {
    const next = {...fx, ...patch};
    onFx(next);
    remember({fx: next});
  };
  const toggleOurs = (key: keyof Annotations) => {
    const next = {...annotations, [key]: !annotations[key]};
    onAnnotations(next);
    remember({[key]: next[key]});
  };

  return (
    <div ref={root} className="settings glass" role="dialog" aria-label="Settings" style={at ? {...at, bottom: 'auto'} : undefined}>
      <nav className="set-seg set-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      {tab === 'display' && <>
      <section>
        <h3>Base map</h3>
        <div className="set-maps" role="radiogroup" aria-label="Base map">
          {BASEMAPS.filter(([id]) => available[id]).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={styleType === id} className={`set-map${styleType === id ? ' on' : ''}`}
              onClick={() => setBasemap(id)}>
              <BasemapThumb id={id} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>Map layers</h3>
        <div className="set-chips" role="group" aria-label="Basemap layers">
          {GROUPS.filter(([slug]) => groupsHere.has(slug)).map(([slug, label]) => (
            <button key={slug} className={visibleGroups[slug] ? 'on' : ''} aria-pressed={!!visibleGroups[slug]}
              onClick={() => toggleGroup(slug)}>{label}</button>
          ))}
        </div>
        {OURS.map(([key, label, hint]) => (
          <label key={key} className="set-switch" title={hint}>
            <span><b>{label}</b><small>{hint}</small></span>
            <input type="checkbox" role="switch" checked={annotations[key]} onChange={() => toggleOurs(key)} />
            <i aria-hidden />
          </label>
        ))}
      </section>
      <section>
        <h3>3D look</h3>
        <div className="set-looks" role="radiogroup" aria-label="3D look">
          {LOOKS.map(([id, label, hint, src]) => (
            <button key={id} role="radio" aria-checked={fx.look3d === id} className={`set-look${fx.look3d === id ? ' on' : ''}`}
              onClick={() => setFx({look3d: id})}>
              <img src={src} alt="" />
              <span>{label}<small>{hint}</small></span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>Bubbles</h3>
        <label className="set-switch" title="A faint glow round every bubble">
          <span><b>Halos</b><small>A faint glow round every bubble</small></span>
          <input type="checkbox" role="switch" checked={fx.halo} onChange={() => setFx({halo: !fx.halo})} />
          <i aria-hidden />
        </label>
        {/* kepler's own panel for the layers' look: colours, heights, opacity */}
        <button className="set-kepler" onClick={() => { if (kepler?.visState) openMapSettings(dispatch, kepler.visState); onClose(); }}>
          <SlidersHorizontal size={15} strokeWidth={1.7} />Layer settings (kepler.gl)
        </button>
      </section>
      </>}
      {tab === 'tools' && <>
      <section>
        <h3>Map interactions</h3>
        {INTERACTIONS.filter(([id]) => interaction[id]).map(([id, label, hint]) => (
          <label key={id} className="set-switch" title={hint}>
            <span><b>{label}</b><small>{hint}</small></span>
            <input type="checkbox" role="switch" checked={!!interaction[id].enabled} onChange={() => toggle(id)} />
            <i aria-hidden />
          </label>
        ))}
      </section>
      <section>
        <h3>Export</h3>
        <button className="set-action" onClick={() => open(EXPORT_IMAGE_ID)}><Image size={15} strokeWidth={1.7} />Map image <small>PNG</small></button>
        <button className="set-action" onClick={() => open(EXPORT_DATA_ID)}><Download size={15} strokeWidth={1.7} />Data <small>CSV</small></button>
        <button className="set-action" onClick={() => open(EXPORT_MAP_ID)}><FileCode2 size={15} strokeWidth={1.7} />Interactive map <small>HTML · JSON</small></button>
      </section>
      </>}
    </div>
  );
}

// A basemap's look in miniature: its land, a park, the Han river and a few roads, in the
// style's own colours. 'None' is the app's bare background with a faint dot grid.
const THUMB: Record<string, {land: string; park: string; water: string; road: string; major: string}> = {
  'dark-matter': {land: '#121417', park: '#181c1a', water: '#22272f', road: '#2c3036', major: '#3b4047'},
  positron: {land: '#f3f2ef', park: '#e6ebe3', water: '#d3dce1', road: '#ffffff', major: '#e2e2e2'},
  voyager: {land: '#f4efe6', park: '#d6e6c6', water: '#a9cfe0', road: '#ffffff', major: '#f6cf86'}
};
function BasemapThumb({id}: {id: string}) {
  const c = THUMB[id];
  return (
    <svg viewBox="0 0 60 40" aria-hidden>
      {c ? <>
        <rect width="60" height="40" fill={c.land} />
        <path d="M6 4h14v10H6zM40 26h14v10H40z" fill={c.park} />
        <path d="M0 27C12 21 20 31 32 25S50 17 60 21" fill="none" stroke={c.water} strokeWidth="5" />
        <path d="M0 12h60M14 0v40M36 0v40M0 34h60" stroke={c.road} strokeWidth="1" />
        <path d="M0 40L48 0" stroke={c.major} strokeWidth="2" />
      </> : <>
        <rect width="60" height="40" fill="#0b0d10" />
        {Array.from({length: 24}, (_, i) => <circle key={i} cx={6 + (i % 6) * 9.6} cy={6 + Math.floor(i / 6) * 9.3} r="0.7" fill="#3a4049" />)}
      </>}
    </svg>
  );
}

function remember(patch: Record<string, unknown>) {
  try {
    const cur = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    localStorage.setItem(STORE_KEY, JSON.stringify({...cur, ...patch}));
  } catch { /* private window or storage off: settings just aren't remembered */ }
}

// Re-applies the remembered basemap and switches once the map is ready.
export function restoreSettings(dispatch: (a: any) => void, kepler: any) {
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return; }
  const basemap = saved.basemap as string | undefined;
  if (basemap && basemap !== kepler?.mapStyle?.styleType && kepler?.mapStyle?.mapStyles?.[basemap]) dispatch(mapStyleChange(basemap));
  dispatch(mapConfigChange({visibleLayerGroups: wantedGroups(kepler?.mapStyle?.visibleLayerGroups || {})} as any));
  const ic = kepler?.visState?.interactionConfig || {};
  for (const [id] of INTERACTIONS) {
    if (typeof saved[id] === 'boolean' && ic[id] && ic[id].enabled !== saved[id]) dispatch(interactionConfigChange({...ic[id], enabled: saved[id]}));
  }
}
