import {useCallback, useEffect, useRef, useState} from 'react';
import {uiZoom} from './uiScale';

// A floating window's place and size, the way kepler.gl keeps its map legend
// (components/map/map-legend-panel + hooks/use-legend-position): moved by a handle, resized
// by another, and on release anchored to the nearer edge of the map on each axis — so it
// stays put against that edge when the screen changes size — and remembered. kepler's
// legend only grows downward; a window is resized from any edge or corner.
// All numbers are the overlay's own CSS pixels (screen pixels / uiZoom()).
export type Anchored = {ax: 'left' | 'right'; x: number; ay: 'top' | 'bottom'; y: number; w: number; h: number};
type Rect = {l: number; t: number; w: number; h: number};
export type Grip = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

// the room a window has: right of the tab rail (--inset), below the top bar
// (--gap + --topbar-h + 8), MARGIN from the other edges
const MARGIN = 16, LEFT = 104, TOP = 76;
function area() {
  const z = uiZoom();
  const W = window.innerWidth / z, H = window.innerHeight / z;
  return {W, H, l: LEFT, t: TOP, r: W - MARGIN, b: H - MARGIN};
}

function toRect(f: Anchored, min: {w: number; h: number}): Rect {
  const A = area();
  // never larger than the room, never smaller than the minimum (unless the room is)
  const w = Math.max(Math.min(min.w, A.r - A.l), Math.min(f.w, A.r - A.l));
  const h = Math.max(Math.min(min.h, A.b - A.t), Math.min(f.h, A.b - A.t));
  const l = f.ax === 'left' ? f.x : A.W - f.x - w;
  const t = f.ay === 'top' ? f.y : A.H - f.y - h;
  return {w, h, l: Math.max(A.l, Math.min(A.r - w, l)), t: Math.max(A.t, Math.min(A.b - h, t))};
}
function toAnchored(r: Rect): Anchored {
  const A = area();
  const left = r.l - A.l < A.r - (r.l + r.w), top = r.t - A.t < A.b - (r.t + r.h);
  return {ax: left ? 'left' : 'right', x: left ? r.l : A.W - r.l - r.w,
    ay: top ? 'top' : 'bottom', y: top ? r.t : A.H - r.t - r.h, w: r.w, h: r.h};
}

// key: where it is remembered; initial: its place before it was ever moved
export function useWindowFrame(key: string, initial: () => Anchored, min: {w: number; h: number}) {
  const [frame, setFrame] = useState<Anchored>(() => {
    try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (saved?.w) return saved; } catch { /* storage off */ }
    return initial();
  });
  const [live, setLive] = useState<Rect | null>(null);   // while a grip is held
  const [maxed, setMaxed] = useState(false);
  const [, rerender] = useState(0);
  useEffect(() => {
    const onResize = () => rerender((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const commit = useCallback((f: Anchored) => {
    setFrame(f);
    try { localStorage.setItem(key, JSON.stringify(f)); } catch { /* storage off */ }
  }, [key]);

  const A = area();
  const rect: Rect = live ?? (maxed ? {l: A.l, t: A.t, w: A.r - A.l, h: A.b - A.t} : toRect(frame, min));
  const rectRef = useRef(rect);
  rectRef.current = rect;

  // a grip held: the window follows the pointer, kept inside the room and above its minimum
  const grab = useCallback((grip: Grip) => (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    e.preventDefault();
    const z = uiZoom(), r0 = rectRef.current, x0 = e.clientX / z, y0 = e.clientY / z;
    const B = area();
    const minW = Math.min(min.w, B.r - B.l), minH = Math.min(min.h, B.b - B.t);
    let last = r0;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX / z - x0, dy = ev.clientY / z - y0;
      let {l, t, w, h} = r0;
      if (grip === 'move') {
        l = Math.max(B.l, Math.min(B.r - w, l + dx));
        t = Math.max(B.t, Math.min(B.b - h, t + dy));
      } else {
        if (grip.includes('e')) w = Math.max(minW, Math.min(B.r - l, r0.w + dx));
        if (grip.includes('s')) h = Math.max(minH, Math.min(B.b - t, r0.h + dy));
        if (grip.includes('w')) { l = Math.max(B.l, Math.min(r0.l + r0.w - minW, r0.l + dx)); w = r0.l + r0.w - l; }
        if (grip.includes('n')) { t = Math.max(B.t, Math.min(r0.t + r0.h - minH, r0.t + dy)); h = r0.t + r0.h - t; }
      }
      last = {l, t, w, h};
      setLive(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (last !== r0) { commit(toAnchored(last)); setMaxed(false); }
      setLive(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, [commit, min.w, min.h]);

  return {style: {left: rect.l, top: rect.t, width: rect.w, height: rect.h}, grab, held: !!live,
    maxed, toggleMax: () => setMaxed((m) => !m)};
}
