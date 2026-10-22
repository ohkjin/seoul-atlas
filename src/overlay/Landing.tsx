import {useEffect, useRef, useState} from 'react';

// The opening page: the earlier atlas's landing (seoul-data-atlas/index.html #landing) — the
// dark field, the light beam, the serif title, the white pill — with its map canvas, which the
// earlier atlas never drew, filled by Seoul in thin white lines: the arterial and mid roads, the
// Han, the districts (public/data/landing_lines.json, scripts/build-landing.mjs), drawn in from
// the centre outward. Chosen from mockups/opening-v2.html: U4's city, without its data lines.
// The app loads behind it; "Explore The Atlas" fades it out (0.9 s, as before).

type Encoded = {origin: [number, number]; unit: number; arterial: number[][]; mid: number[][]; water: number[][]; gu: number[][]};
type Line = [number, number][];

// As the earlier atlas did, the dev server goes straight to the map; ?landing shows it there.
export function landingWanted() {
  const h = location.hostname;
  const local = h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '' || h.endsWith('.localhost');
  return !local || new URLSearchParams(location.search).has('landing');
}

// each kind of line: its white, its width, whether it closes, its dash
const LAYERS: [keyof Encoded, number, number, boolean, number[]][] = [
  ['mid', 0.11, 0.5, false, []],
  ['arterial', 0.26, 0.6, false, []],
  ['water', 0.34, 0.8, true, []],
  ['gu', 0.16, 0.6, true, [3, 4]]
];
const DIM = 0.6;        // the city a step back from full (U4's level)
const DRAW_IN = 2.4;    // seconds, centre to edge
const BOX = [126.764, 37.413, 127.184, 37.715], K0 = Math.cos(37.56 * Math.PI / 180);

// the file's lines: a first point, then steps, in units from the origin
const decode = (d: Encoded, flat: number[]): Line => {
  const pts: Line = [];
  let x = 0, y = 0;
  for (let i = 0; i < flat.length; i += 2) {
    x = i ? x + flat[i] : flat[i]; y = i ? y + flat[i + 1] : flat[i + 1];
    pts.push([d.origin[0] + x * d.unit, d.origin[1] + y * d.unit]);
  }
  return pts;
};

export default function Landing({onDone}: {onDone: () => void}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    type Layer = {lines: Line[]; a: number; lw: number; closed: boolean; dash: number[]};
    let raf = 0, alive = true, lines: Layer[] | null = null;
    // on screen, for the current size: each line's points and its middle's distance from the centre
    let shown: {w: number; h: number; maxD: number; layers: {L: Layer; paths: {p: Line; d: number}[]}[]} | null = null;
    const project = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const s = Math.min(w * 0.86 / ((BOX[2] - BOX[0]) * K0), h * 0.86 / (BOX[3] - BOX[1]));
      const cx = w / 2, cy = h / 2 - h * 0.02;
      shown = {w, h, maxD: Math.hypot(w, h) / 2, layers: lines!.map((L) => ({L, paths: L.lines.map((pts) => {
        const p: Line = pts.map(([lng, lat]) => [cx + (lng - (BOX[0] + BOX[2]) / 2) * K0 * s, cy - (lat - (BOX[1] + BOX[3]) / 2) * s]);
        const m = p[Math.floor(p.length / 2)];
        return {p, d: Math.hypot(m[0] - cx, m[1] - cy)};
      })}))};
    };
    // every line whose middle lies within `reach` (0–1) of the centre
    const draw = (reach: number) => {
      const el = canvas.current;
      if (!el || !shown) return;
      const dpr = window.devicePixelRatio || 1, {w, h} = shown;
      if (el.width !== Math.round(w * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); }
      const ctx = el.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const r = reach * shown.maxD;
      for (const {L, paths} of shown.layers) {
        ctx.strokeStyle = `rgba(236, 240, 246, ${L.a * DIM})`; ctx.lineWidth = L.lw; ctx.setLineDash(L.dash);
        ctx.beginPath();
        for (const {p, d} of paths) {
          if (d > r) continue;
          ctx.moveTo(p[0][0], p[0][1]);
          for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
          if (L.closed) ctx.closePath();
        }
        ctx.stroke();
      }
    };
    fetch('/data/landing_lines.json').then((res) => res.json()).then((d: Encoded) => {
      if (!alive) return;
      lines = LAYERS.map(([key, a, lw, closed, dash]) => ({lines: (d[key] as number[][]).map((f) => decode(d, f)), a, lw, closed, dash}));
      project();
      const start = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / 1000 / DRAW_IN);
        draw(k ** 0.8);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }).catch(() => { /* no lines: the beam and the title stand alone */ });
    const resize = () => { if (!lines) return; cancelAnimationFrame(raf); project(); draw(1); };
    window.addEventListener('resize', resize);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  const enter = () => { setLeaving(true); window.setTimeout(onDone, 900); };
  return (
    <section className={`landing${leaving ? ' leaving' : ''}`} aria-label="Seoul Data Atlas">
      <canvas ref={canvas} className="landing-map" aria-hidden />
      <div className="light-beam" aria-hidden />
      <div className="landing-content">
        <h1 className="landing-title">Seoul Data Atlas</h1>
        <button className="cta-button" onClick={enter} autoFocus>Explore The Atlas</button>
      </div>
    </section>
  );
}
