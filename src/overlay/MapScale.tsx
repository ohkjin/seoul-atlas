import {useKepler} from './useKepler';
import {uiZoom} from './uiScale';

// The map's zoom and a distance scale — shown with the hex grid, to say where it starts.
// kepler has no scale of its own, and handing MapLibre's ScaleControl the map proved
// unreliable (kepler passes its map ref before the map exists, and not again), so the
// scale is worked out here from kepler's camera, the way MapLibre's is: the ground
// distance of one screen pixel at the map's centre, rounded down to a 1–2–5 step that
// fits in MAX_PX.
const MAX_PX = 110;
const EARTH = 40075016.686;   // metres round the equator

export default function MapScale() {
  const m = useKepler()?.mapState;
  if (!m) return null;
  // MapLibre's 512-px tiles; the bar lives in the zoomed overlay, so its px are scaled back
  const metresPerPx = (EARTH * Math.cos((m.latitude * Math.PI) / 180)) / (512 * 2 ** m.zoom) * uiZoom();
  const max = metresPerPx * MAX_PX;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [5, 2, 1].map((d) => d * pow).find((d) => d <= max) ?? pow;
  const label = step >= 1000 ? `${step / 1000} km` : `${step} m`;
  return (
    <div className="map-scale" aria-hidden>
      <span className="ms-zoom">zoom {m.zoom.toFixed(1)}</span>
      <span className="ms-bar" style={{width: step / metresPerPx}}>{label}</span>
    </div>
  );
}
