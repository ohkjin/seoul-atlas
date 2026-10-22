// Dev-only layout check: reports every pair of on-screen panels whose rectangles
// overlap. Run `__overlaps()` in the console after resizing or opening a panel.
const PANELS: Record<string, string> = {
  topbar: '.topbar',
  focus: '.focus',
  graph: '.graph-card',
  drawerCards: '.drawer-cols',
  drawerSheet: '.drawer.open .drawer-sheet',
  timeCard: '.time-card',
  sidePanel: '.side-panel--container',
  tooltip: '.map-popover'
};

type Rect = {x: number; y: number; w: number; h: number};

export function overlaps() {
  const rects: Record<string, Rect> = {};
  for (const [name, sel] of Object.entries(PANELS)) {
    const el = document.querySelector(sel);
    if (!el || getComputedStyle(el).display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    rects[name] = {x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height)};
  }
  const names = Object.keys(rects);
  const hits: string[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = rects[names[i]], b = rects[names[j]];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0 && oy > 0) hits.push(`${names[i]} × ${names[j]}: ${ox}×${oy}px`);
    }
  }
  return {viewport: [innerWidth, innerHeight], rects, overlaps: hits};
}
