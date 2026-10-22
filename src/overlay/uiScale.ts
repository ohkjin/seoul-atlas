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
// never scaled.
export const UI_BASE = {w: 1440, h: 900};
const SIZE = 0.85, SHARE = 0.5, MAX = 1;

export function computeUiZoom(w = window.innerWidth, h = window.innerHeight) {
  const s = Math.min(w / UI_BASE.w, h / UI_BASE.h);
  const grow = Math.min(MAX, 1 + Math.max(0, s - 1) * SHARE);
  return Math.round(SIZE * grow * 20) / 20;
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
