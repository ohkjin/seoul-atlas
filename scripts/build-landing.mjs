// Builds the white line drawing behind the opening page (src/overlay/Landing.tsx), from the
// earlier atlas's OpenStreetMap extracts and this app's district outlines:
//   ../seoul-data-atlas/data/roads.json   — arterial and mid roads (polylines)
//   ../seoul-data-atlas/data/nature.json  — water polygons (the Han and its tributaries)
//   public/data/gu_geometry.json          — the 25 districts
// Writes
//   public/data/landing_lines.json  { origin, unit, arterial, mid, water, gu }
// Each line is a flat list of integers: the first point, then each next point as the step
// from the one before, in units of 0.0001° from `origin` — small numbers, a small file. Lines
// are simplified to ~30 m (below a pixel at the opening's scale); bits shorter than that go.
// About 365 KB, 140 KB gzipped.
// Run from seoul-atlas-kepler/:  node scripts/build-landing.mjs
import fs from 'node:fs';

const SRC = '../seoul-data-atlas/data';
const ORIGIN = [126.7, 37.4], UNIT = 1e-4, TOLERANCE = 3;   // in units: 3 × 0.0001° ≈ 30 m, under a pixel here
const SEOUL = [126.79, 37.42, 127.19, 37.71];                 // water outside this box is left out

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const toUnits = ([lng, lat]) => [Math.round((lng - ORIGIN[0]) / UNIT), Math.round((lat - ORIGIN[1]) / UNIT)];

// Douglas–Peucker on unit coordinates. A closed ring starts and ends on the same point, where
// every distance to the chord is zero, so it is simplified as two halves.
function simplify(pts) {
  if (pts.length < 3) return pts;
  const [f, l] = [pts[0], pts[pts.length - 1]];
  if (f[0] === l[0] && f[1] === l[1] && pts.length > 3) {
    const mid = Math.floor(pts.length / 2);
    return [...simplify(pts.slice(0, mid + 1)), ...simplify(pts.slice(mid)).slice(1)];
  }
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b], len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1, farD = TOLERANCE;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > farD) { far = i; farD = d; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const span = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
function encode(line) {
  const pts = simplify(line.map(toUnits));
  if (span(pts) < TOLERANCE) return null;
  const flat = [pts[0][0], pts[0][1]];
  for (let i = 1; i < pts.length; i++) flat.push(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return flat;
}
const encodeAll = (lines) => lines.map(encode).filter(Boolean);
const ringsOf = (g) => (g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]));
const inSeoul = (ring) => ring.every(([x, y]) => x > SEOUL[0] && x < SEOUL[2] && y > SEOUL[1] && y < SEOUL[3]);
const area = (r) => Math.abs(r.reduce((s, p, i) => { const n = r[(i + 1) % r.length]; return s + p[0] * n[1] - n[0] * p[1]; }, 0)) / 2;

const roads = read(`${SRC}/roads.json`);
const nature = read(`${SRC}/nature.json`);
const gu = read('public/data/gu_geometry.json');
const water = nature.features.filter((f) => f.properties.k === 'water').flatMap((f) => ringsOf(f.geometry))
  .filter(inSeoul).sort((a, b) => area(b) - area(a)).slice(0, 40);

const out = {
  origin: ORIGIN, unit: UNIT,
  arterial: encodeAll(roads.arterial),
  mid: encodeAll(roads.mid),
  water: encodeAll(water),
  gu: encodeAll(gu.flatMap((g) => ringsOf(g.geometry)))
};
fs.writeFileSync('public/data/landing_lines.json', JSON.stringify(out));
const kb = (fs.statSync('public/data/landing_lines.json').size / 1024).toFixed(0);
console.log(`landing_lines.json: ${kb} KB —`, ['arterial', 'mid', 'water', 'gu'].map((k) => `${k} ${out[k].length}`).join(', '));
