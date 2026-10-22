import {Navigation2} from 'lucide-react';
import {VAR_BY_KEY} from '../data/catalog';
import {useKepler} from './useKepler';

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

// A thin status line along the foot of the screen, as in the earlier atlas: the camera —
// the point under the cursor (the map's centre when the cursor is off the map), zoom,
// bearing and tilt — and, on the right, the sources of what is on the map.
export default function StatusBar({selection}: {selection: string[]}) {
  const kepler = useKepler();
  const m = kepler?.mapState;
  // kepler keeps the last point under the cursor while any map interaction is on
  const cursor: [number, number] | null = kepler?.visState?.mousePos?.coordinate ?? null;
  const [lng, lat] = cursor ?? (m ? [m.longitude, m.latitude] : [0, 0]);
  const sources = [...new Set(selection.map((k) => VAR_BY_KEY[k]?.source).filter(Boolean))].join(' · ');
  const bearing = m?.bearing ?? 0;

  return (
    <footer className="status-bar">
      <div className="sb-num"><span className="sb-lbl">{cursor ? 'Cursor' : 'Centre'}</span>
        {lat.toFixed(4)}°N&nbsp;&nbsp;{lng.toFixed(4)}°E</div>
      <div className="sb-num"><span className="sb-lbl">Zoom</span>{(m?.zoom ?? 0).toFixed(1)}</div>
      <div className="sb-num" title="Map bearing — the compass direction at the top of the screen">
        <span className="sb-lbl">Bearing</span>
        <Navigation2 size={11} strokeWidth={2} className="sb-north" style={{transform: `rotate(${-bearing}deg)`}} aria-hidden />
        {Math.round(((bearing % 360) + 360) % 360)}° {compass(bearing)}
      </div>
      <div className="sb-num"><span className="sb-lbl">Tilt</span>{Math.round(m?.pitch ?? 0)}°{m?.dragRotate ? ' · 3D' : ''}</div>
      {sources && <div className="sb-src" title={sources}><span className="sb-lbl">Sources</span>{sources}</div>}
    </footer>
  );
}
