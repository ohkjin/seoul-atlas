import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useDispatch, useStore} from 'react-redux';
import {interactionConfigChange, mapConfigChange, mapStyleChange, toggleModal} from '@kepler.gl/actions';
import {EXPORT_DATA_ID, EXPORT_IMAGE_ID, EXPORT_MAP_ID, NO_MAP_ID} from '@kepler.gl/constants';
import {Download, FileCode2, Image, SlidersHorizontal} from 'lucide-react';
import {useKepler} from './useKepler';
import {openMapSettings} from './layers';
import {uiZoom} from './uiScale';
import type {Annotations} from './MapAnnotations';

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
// Ours, drawn over the map (MapAnnotations).
const OURS: [keyof Annotations, string, string][] = [
  ['names', 'Gu · dong names', 'Districts on the whole city, neighbourhoods when zoomed in'],
  ['boundaries', 'Gu · dong boundaries', 'Dashed outlines; neighbourhoods when zoomed in'],
];
const STORE_KEY = 'seoul-atlas.settings';

// The remembered switches for the names and boundaries over the map (on unless turned off).
export function rememberedAnnotations(): Annotations {
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { /* storage off */ }
  return {names: saved.names !== false, boundaries: saved.boundaries !== false};
}

// Settings: a glass panel dropping from the top bar's Settings tab, in the app's own
// style, for what kepler can do but the app keeps out of sight — the basemap and its
// layers, the gu and dong names and boundaries drawn over the map, the map's hover
// interactions, and exporting the map or its data (kepler's own export dialogs).
// The detailed per-layer settings stay behind the ⚙ on the first map card; the button
// at the bottom opens them too. Basemap and switches are remembered in this browser.
type Props = {onClose: () => void; annotations: Annotations; onAnnotations: (a: Annotations) => void};
export default function SettingsPanel({onClose, annotations, onAnnotations}: Props) {
  const dispatch = useDispatch();
  const store = useStore<any>();
  const kepler = useKepler();
  const root = useRef<HTMLDivElement>(null);
  const styleType = kepler?.mapStyle?.styleType;
  const available = kepler?.mapStyle?.mapStyles || {};
  const interaction = kepler?.visState?.interactionConfig || {};
  const visibleGroups = kepler?.mapStyle?.visibleLayerGroups || {};
  const groupsHere = new Set((available[styleType]?.layerGroups || []).map((g: any) => g.slug));
  // hangs under the Settings tab, kept on screen
  const [left, setLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    const r = document.querySelector('[data-settings-tab]')?.getBoundingClientRect();
    const z = uiZoom();   // screen pixels → the zoomed overlay's pixels
    if (r) setLeft(Math.max(16, Math.min(window.innerWidth / z - 316, (r.left + r.width / 2) / z - 150)));
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

  const setBasemap = (id: string) => { dispatch(mapStyleChange(id) as any); remember({basemap: id}); };
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
  const toggleOurs = (key: keyof Annotations) => {
    const next = {...annotations, [key]: !annotations[key]};
    onAnnotations(next);
    remember({[key]: next[key]});
  };

  return (
    <div ref={root} className="settings glass" role="dialog" aria-label="Settings" style={left != null ? {left} : undefined}>
      <section>
        <h3>Base map</h3>
        <div className="set-seg" role="radiogroup" aria-label="Base map">
          {BASEMAPS.filter(([id]) => available[id]).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={styleType === id} className={styleType === id ? 'on' : ''}
              onClick={() => setBasemap(id)}>{label}</button>
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
      <button className="set-kepler" onClick={() => { if (kepler?.visState) openMapSettings(dispatch, kepler.visState); onClose(); }}>
        <SlidersHorizontal size={15} strokeWidth={1.7} />Layer settings (kepler.gl)
      </button>
    </div>
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
  const groups = saved.groups as Record<string, boolean> | undefined;
  if (groups && typeof groups === 'object') dispatch(mapConfigChange({visibleLayerGroups: {...kepler?.mapStyle?.visibleLayerGroups, ...groups}} as any));
  const ic = kepler?.visState?.interactionConfig || {};
  for (const [id] of INTERACTIONS) {
    if (typeof saved[id] === 'boolean' && ic[id] && ic[id].enabled !== saved[id]) dispatch(interactionConfigChange({...ic[id], enabled: saved[id]}));
  }
}
