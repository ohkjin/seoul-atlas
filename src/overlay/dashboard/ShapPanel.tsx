import {useMemo, useState} from 'react';
import {ChevronDown, ChevronRight} from 'lucide-react';
import {SHAP_GROUPS, VAR_BY_KEY} from '../../data/catalog';
import type {DashCtx} from './Dashboard';

// What drives RHSI: the UHUS model's SHAP contributions as beeswarms, in the six groups of
// the drawer's SHAP folders. Each row is every neighbourhood (422 dots) placed by its
// contribution — left lowers RHSI (sales fall in heat), right raises it — and coloured by
// the input's own value, low blue to high red, as a SHAP summary plot does. A group's row is
// the sum of its inputs. The focused place is ringed with its value at the right (a
// district: the mean of its dongs). Groups open and fold; the two strongest start open.
// Clicking a dot focuses that neighbourhood. Mockup: mockups/shap-swarm.png.
const W = 940, LABEL = 200, VALW = 64, PLOT = W - LABEL - VALW, HEAD = 34, ROW = 32, R = 1.6;
const GAP = R * 2 + 0.25;

type Table = {codes: string[]; names: string[]; gus: string[]; col: (key: string) => number[]};

function readDongs(datasets: any): Table | null {
  const d = datasets?.dong;
  if (!d) return null;
  const n = d.dataContainer.numRows();
  const idx = (k: string) => d.fields.findIndex((f: any) => f.name === k);
  const read = (k: string) => { const i = idx(k); return Array.from({length: n}, (_, r) => d.dataContainer.valueAt(r, i)); };
  const num = (k: string) => read(k).map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN));
  return {codes: read('dong_code').map(String), names: read('dong_name').map(String), gus: read('gu_code').map(String), col: num};
}

// a beeswarm's vertical offsets: dots in x order, each at the free slot nearest the centre
// line among the dots it would touch (only those within a dot's width to its left)
function swarm(px: number[], half: number): number[] {
  const order = px.map((_, i) => i).filter((i) => Number.isFinite(px[i])).sort((a, b) => px[a] - px[b]);
  const dy = new Array(px.length).fill(NaN);
  let active: number[] = [];
  for (const i of order) {
    active = active.filter((j) => px[i] - px[j] < GAP);
    let y = 0;
    for (let k = 0; k < 80; k++) {
      y = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * GAP;
      if (!active.some((j) => Math.abs(dy[j] - y) < GAP && Math.hypot(px[i] - px[j], dy[j] - y) < GAP)) break;
    }
    dy[i] = Math.max(-half, Math.min(half, y));
    active.push(i);
  }
  return dy;
}

// low blue → grey → high red, by rank within the row
function rankColours(vals: number[]): string[] {
  const sorted = vals.filter(Number.isFinite).sort((a, b) => a - b);
  const stops = [[59, 111, 209], [201, 201, 214], [224, 72, 78]];
  return vals.map((v) => {
    if (!Number.isFinite(v)) return 'rgba(169,178,191,0.4)';
    const t = sorted.length > 1 ? sorted.indexOf(v) / (sorted.length - 1) : 0.5;
    const [a, b, u] = t < 0.5 ? [stops[0], stops[1], t * 2] : [stops[1], stops[2], (t - 0.5) * 2];
    return `rgb(${a.map((c, k) => Math.round(c + (b[k] - c) * u)).join(',')})`;
  });
}

const fmt = (x: number) => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(3)}` : '—');

export default function ShapPanel({ctx}: {ctx: DashCtx}) {
  const {datasets, focus, onPick} = ctx;
  const datasetKeys = Object.keys(datasets || {}).join();
  const table = useMemo(() => readDongs(datasets), [datasetKeys]);   // eslint-disable-line react-hooks/exhaustive-deps

  // every row's values, dots and colours, built once per data load
  const rows = useMemo(() => {
    if (!table) return null;
    const groups = SHAP_GROUPS.map((g) => ({
      ...g, sum: table.col(g.key),
      kids: g.inputs.map((k) => ({key: k, label: VAR_BY_KEY[`shap_${k}`]?.short.replace(/^SHAP · /, '') ?? k,
        shap: table.col(`shap_${k}`), value: table.col(k)}))
    }));
    // one axis for every row, to the 99th percentile of |SHAP|; the few beyond sit at its ends
    const all = groups.flatMap((g) => g.kids.flatMap((k) => k.shap)).filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
    const lim = (all[Math.floor(all.length * 0.99)] || 0.01) * 1.05;
    const X = (v: number) => LABEL + (Math.max(-lim, Math.min(lim, v)) + lim) / (2 * lim) * PLOT;
    const layout = (vals: number[], h: number) => { const px = vals.map(X); return {px, dy: swarm(px, h / 2 - R)}; };
    return {lim, X, groups: groups.map((g) => ({...g, dots: layout(g.sum, HEAD),
      kids: g.kids.map((k) => ({...k, dots: layout(k.shap, ROW), colours: rankColours(k.value)}))}))};
  }, [table]);

  // the focused place's value of a row: its own, a district's mean, none for Seoul
  const members = useMemo(() => {
    if (!table || focus.level === 'seoul') return null;
    if (focus.level === 'dong') return [table.codes.indexOf(focus.dong.code)].filter((i) => i >= 0);
    return table.gus.map((g, i) => (g === focus.gu.code ? i : -1)).filter((i) => i >= 0);
  }, [table, focus]);
  const valueOf = (vals: number[]) => {
    if (!members?.length) return NaN;
    const v = members.map((i) => vals[i]).filter(Number.isFinite);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
  };
  const meanAbs = (vals: number[]) => { const v = vals.filter(Number.isFinite); return v.reduce((a, b) => a + Math.abs(b), 0) / (v.length || 1); };

  // strongest first: for the focused place, else across Seoul
  const ordered = useMemo(() => {
    if (!rows) return [];
    const weight = (vals: number[]) => (members?.length ? Math.abs(valueOf(vals)) : meanAbs(vals));
    return rows.groups.map((g) => ({...g, kids: [...g.kids].sort((a, b) => weight(b.shap) - weight(a.shap))}))
      .sort((a, b) => weight(b.sum) - weight(a.sum));
  }, [rows, members]);   // eslint-disable-line react-hooks/exhaustive-deps

  // which groups are open: the two strongest until the user opens or folds one
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const open = chosen ?? new Set(ordered.slice(0, 2).map((g) => g.key));
  const toggle = (key: string) => {
    const next = new Set(open);
    if (next.has(key)) next.delete(key); else next.add(key);
    setChosen(next);
  };

  // the dots, drawn once per row (hundreds each — not on every playback step)
  const dotsOf = useMemo(() => {
    const cache = new Map<string, JSX.Element[]>();
    return (key: string, dots: {px: number[]; dy: number[]}, colours: string[] | null, label: string) => {
      if (!cache.has(key) && table) {
        cache.set(key, dots.px.map((x, i) => (Number.isFinite(x) ? (
          <circle key={i} cx={x.toFixed(1)} cy={dots.dy[i].toFixed(1)} r={R} fill={colours ? colours[i] : 'rgba(169,178,191,0.55)'}
            onClick={() => onPick('dong', table.codes[i])}>
            <title>{`${table.names[i]} · ${label}`}</title>
          </circle>
        ) : null)).filter(Boolean) as JSX.Element[]);
      }
      return cache.get(key) ?? [];
    };
  }, [rows]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows) return <p className="dash-empty">Loading the neighbourhoods…</p>;
  const {X, lim} = rows;
  let y = 4;
  const parts: JSX.Element[] = [];
  const ring = (vals: number[], yc: number) => {
    const v = valueOf(vals);
    return Number.isFinite(v) ? <circle className="shap-ring" cx={X(v)} cy={yc} r={4.6} /> : null;
  };
  for (const g of ordered) {
    const yc = y + HEAD / 2, isOpen = open.has(g.key);
    parts.push(
      <g key={g.key} className="shap-group">
        <rect x={0} y={y} width={W} height={HEAD} className="shap-hit" onClick={() => toggle(g.key)} />
        <foreignObject x={0} y={y + 6} width={LABEL - 8} height={22}>
          <button className="shap-head" onClick={() => toggle(g.key)} aria-expanded={isOpen}>
            {isOpen ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
            {g.label} <span className="shap-n">({g.kids.length})</span>
          </button>
        </foreignObject>
        <line x1={X(0)} x2={X(0)} y1={y + 3} y2={y + HEAD - 3} className="shap-zero" />
        <g transform={`translate(0 ${yc})`}>{dotsOf(g.key, g.dots, null, `${g.label} (sum)`)}</g>
        {ring(g.sum, yc)}
        <text x={W} y={yc + 4} textAnchor="end" className="shap-val strong">{fmt(valueOf(g.sum))}</text>
      </g>
    );
    y += HEAD;
    if (!isOpen) continue;
    for (const k of g.kids) {
      const yk = y + ROW / 2;
      parts.push(
        <g key={k.key}>
          <line x1={10} x2={10} y1={y} y2={y + ROW} className="shap-guide" />
          <text x={22} y={yk + 4} className="shap-label">{k.label}</text>
          <line x1={X(0)} x2={X(0)} y1={y + 3} y2={y + ROW - 3} className="shap-zero faint" />
          <g transform={`translate(0 ${yk})`}>{dotsOf(k.key, k.dots, k.colours, k.label)}</g>
          {ring(k.shap, yk)}
          <text x={W} y={yk + 4} textAnchor="end" className="shap-val">{fmt(valueOf(k.shap))}</text>
        </g>
      );
      y += ROW;
    }
  }
  const axisY = y + 12;
  const place = focus.level === 'seoul' ? null : focus.level === 'gu' ? `${focus.gu.name} (mean of its neighbourhoods)` : focus.dong.name;
  return (
    <div className="shap">
      <p className="shap-sum">
        {place ? <>{place} · its 25 contributions add up to <b>{fmt(valueOf(rows.groups.reduce<number[]>(
          (acc, g) => g.sum.map((v, i) => (acc[i] ?? 0) + v), [])))}</b> on top of the Seoul average</> : 'All of Seoul · groups in order of their average influence'}
        {' · 422 neighbourhoods per row'}
      </p>
      <svg viewBox={`0 0 ${W} ${axisY + 6}`} className="shap-svg">
        {parts}
        <text x={X(-lim)} y={axisY} className="shap-axis">{fmt(-lim)}</text>
        <text x={X(0)} y={axisY} className="shap-axis" textAnchor="middle">0</text>
        <text x={X(lim)} y={axisY} className="shap-axis" textAnchor="end">{fmt(lim)}</text>
      </svg>
      <div className="shap-legend">
        <span>dot = a neighbourhood · left lowers RHSI (sales fall in heat), right raises it</span>
        <span>input value: low <i className="shap-ramp" /> high</span>
        {place && <span><i className="shap-ring-key" /> this place</span>}
      </div>
    </div>
  );
}
