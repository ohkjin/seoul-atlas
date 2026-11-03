import {useEffect} from 'react';

// The whole overlay is drawn at SIZE of its CSS pixels with CSS zoom — every panel, gap
// and font at once — for the small, tight, high-resolution look the atlas is after
// (styles.css sizes things in px; this keeps their proportions while shrinking them).
// Laid out in the zoomed space, the panels also get more room: the dashboard window and
// the Data and About pages, sized to the screen, still fill it. On screens larger than
// 1440×900 it can also grow with the screen — SHARE of the growth (whichever of width or
// height grows less), capped at MAX — but that is off (MAX = 1): scaled up, the panels
// read as too big. Steps of 0.05, so a resize does not re-lay out on every pixel.
// Everything that converts screen pixels (uiZoom below) allows for it; the map itself is
// never scaled. SIZE is the person's: Settings → Text size picks it (remembered with the
// other settings), compact by default.
export const UI_BASE = {w: 1440, h: 900};
const SHARE = 0.5, MAX = 1;
export const TEXT_SIZES: [string, string, number][] = [['compact', 'Compact', 0.85], ['standard', 'Standard', 1], ['large', 'Large', 1.15]];
const STORE_KEY = 'seoul-atlas.settings';

export function textSize(): string {
  try {
    const id = JSON.parse(localStorage.getItem(STORE_KEY) || '{}').textSize;
    if (TEXT_SIZES.some(([k]) => k === id)) return id;
  } catch { /* storage off */ }
  return 'compact';
}

// the size picked where the browser keeps no storage: it holds until the page reloads
let current: string | null = null;

// a new size: remembered, then every panel re-laid out at it (as a window resize does)
export function setTextSize(id: string) {
  try {
    const cur = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    localStorage.setItem(STORE_KEY, JSON.stringify({...cur, textSize: id}));
  } catch { current = id; }
  window.dispatchEvent(new Event('resize'));
}

export function computeUiZoom(w = window.innerWidth, h = window.innerHeight) {
  const size = TEXT_SIZES.find(([k]) => k === (current ?? textSize()))?.[2] ?? 0.85;
  const s = Math.min(w / UI_BASE.w, h / UI_BASE.h);
  const grow = Math.min(MAX, 1 + Math.max(0, s - 1) * SHARE);
  return Math.round(size * grow * 20) / 20;
}

// The current factor, for code that turns screen pixels (pointer events, bounding
// boxes) into the overlay's own CSS pixels.
export function uiZoom(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom'));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

export function useUiScale() {
  useEffect(() => {
    const apply = () => {
      const z = computeUiZoom();
      if (uiZoom() !== z || !document.documentElement.style.getPropertyValue('--ui-zoom')) {
        document.documentElement.style.setProperty('--ui-zoom', String(z));
      }
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);
}
