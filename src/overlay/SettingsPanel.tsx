import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useDispatch} from 'react-redux';
import {interactionConfigChange, mapStyleChange, toggleModal} from '@kepler.gl/actions';
import {EXPORT_DATA_ID, EXPORT_IMAGE_ID, EXPORT_MAP_ID, NO_MAP_ID} from '@kepler.gl/constants';
import {Download, FileCode2, Image, SlidersHorizontal} from 'lucide-react';
import {useKepler} from './useKepler';
import {openMapSettings} from './layers';
import {uiZoom} from './uiScale';

// The basemaps that need no Mapbox token (the app runs without one), in this order.
const BASEMAPS: [string, string][] = [['dark-matter', 'Dark'], ['positron', 'Light'], ['voyager', 'Streets'], [NO_MAP_ID, 'None']];
// kepler's map interactions worth a switch. Place search (geocoder) is left out: it
// queries Mapbox and needs a token.
const INTERACTIONS: [string, string, string][] = [
  ['tooltip', 'Hover tooltip', 'Values of the place under the cursor'],
  ['brush', 'Brush', 'Highlight only what is near the cursor'],
  ['coordinate', 'Coordinates', 'Show the latitude and longitude under the cursor'],
];
const STORE_KEY = 'seoul-atlas.settings';

// Settings: a glass panel dropping from the top bar's Settings tab, in the app's own
// style, for what kepler can do but the app keeps out of sight — the basemap, the map's
// hover interactions, and exporting the map or its data (kepler's own export dialogs).
// The detailed per-layer settings stay behind the ⚙ on the first map card; the button
// at the bottom opens them too. Basemap and switches are remembered in this browser.
export default function SettingsPanel({onClose}: {onClose: () => void}) {
  const dispatch = useDispatch();
  const kepler = useKepler();
  const root = useRef<HTMLDivElement>(null);
  const styleType = kepler?.mapStyle?.styleType;
  const available = kepler?.mapStyle?.mapStyles || {};
  const interaction = kepler?.visState?.interactionConfig || {};
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
  const ic = kepler?.visState?.interactionConfig || {};
  for (const [id] of INTERACTIONS) {
    if (typeof saved[id] === 'boolean' && ic[id] && ic[id].enabled !== saved[id]) dispatch(interactionConfigChange({...ic[id], enabled: saved[id]}));
  }
}
