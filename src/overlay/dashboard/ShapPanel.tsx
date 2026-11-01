import {useMemo, useState} from 'react';
import {ChevronDown, ChevronRight} from 'lucide-react';
import {SHAP_GROUPS, VAR_BY_KEY} from '../../data/catalog';
import {niceTicks} from '../scatter';
import type {DashCtx} from './Dashboard';

// What drives RHSI, from the UHUS model's SHAP contributions — in two parts.
// The waterfall: the focused place (a district: the mean of its dongs) from Seoul's average
// RHSI, pushed by each of the six groups of the drawer's SHAP folders, to the model's value
// for it; the small groups fold into one bar. Log-ratio contributions add up, so the bars are
// exact. Then the beeswarm (below): each row every neighbourhood (422 dots) placed by its
// contribution — left lowers RHSI (sales fall in heat) — and coloured by the input's own
// value. Clicking a dot focuses that neighbourhood.
const W = 940;
const FOLD = 0.01;                    // groups pushing less than this fold into "Other" in the waterfall

export type Table = {codes: string[]; names: string[]; gus: string[]; col: (key: string) => number[]};

export function readDongs(datasets: any): Table | null {
  const d = datasets?.dong;
  if (!d) return null;
  const n = d.dataContainer.numRows();
  const idx = (k: string) => d.fields.findIndex((f: any) => f.name === k);
  const read = (k: string) => { const i = idx(k); return Array.from({length: n}, (_, r) => d.dataContainer.valueAt(r, i)); };
  const num = (k: string) => read(k).map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN));
  return {codes: read('dong_code').map(String), names: read('dong_name').map(String), gus: read('gu_code').map(String), col: num};
}

const mean = (v: number[]) => { const f = v.filter(Number.isFinite); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN; };
const signed = (x: number, d = 3) => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}` : '—');
const asPct = (x: number) => `≈ ${(Math.exp(x) - 1) * 100 >= 0 ? '+' : '−'}${Math.abs((Math.exp(x) - 1) * 100).toFixed(0)}%`;

export default function ShapPanel({ctx}: {ctx: DashCtx}) {
  const {datasets, focus, onPick} = ctx;
  const datasetKeys = Object.keys(datasets || {}).join();
  const table = useMemo(() => readDongs(datasets), [datasetKeys]);   // eslint-disable-line react-hooks/exhaustive-deps
  // the focused place's rows: its own, a district's dongs, none for Seoul
  const members = useMemo(() => {
    if (!table || focus.level === 'seoul') return null;
    if (focus.level === 'dong') return [table.codes.indexOf(focus.dong.code)].filter((i) => i >= 0);
    return table.gus.map((g, i) => (g === focus.gu.code ? i : -1)).filter((i) => i >= 0);
  }, [table, focus]);
  if (!table) return <p className="dash-empty">Loading the neighborhoods…</p>;
  const place = focus.level === 'seoul' ? null : focus.level === 'gu' ? focus.gu.name : focus.dong.name;
  return (
    <div className="shap">
      {members?.length && place
        ? <Waterfall table={table} members={members} place={place} isGu={focus.level === 'gu'} />
        : <p className="shap-sum">Focus a neighborhood or a district to see why its RHSI is what it is.</p>}
      <h3 className="shap-sub">All neighborhoods — what each input does to RHSI, by group</h3>
      <Beeswarm table={table} members={members} onPick={(code) => onPick('dong', code)} />
    </div>
  );
}

// Seoul's average, each group's push for this place, and where that leaves it.
function Waterfall({table, members, place, isGu}: {table: Table; members: number[]; place: string; isGu: boolean}) {
  const at = (vals: number[]) => mean(members.map((i) => vals[i]));
  const base = mean(table.col('RHSI_retail'));
  const groups = SHAP_GROUPS.map((g) => {
    const kids = g.inputs.map((k) => ({k, v: at(table.col(`shap_${k}`))})).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    // under the name, its three strongest inputs here — the whole list overran the bars
    const names = kids.slice(0, 3).map((c) => VAR_BY_KEY[c.k]?.short ?? c.k).join(' · ');
    return {label: g.label, inputs: kids.length > 3 ? `${names} +${kids.length - 3}` : names, v: at(table.col(g.key)), top: kids[0]};
  }).filter((g) => Number.isFinite(g.v)).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const big = groups.filter((g) => Math.abs(g.v) >= FOLD), small = groups.filter((g) => Math.abs(g.v) < FOLD);
  const steps = [...big, ...(small.length ? [{label: `Other ${small.length}`, inputs: small.map((g) => g.label).join(' · '),
    v: small.reduce((a, g) => a + g.v, 0), top: null}] : [])];
  const end = base + steps.reduce((a, s) => a + s.v, 0), actual = at(table.col('RHSI_retail'));
  let c = base; const pts = [0, base]; steps.forEach((s) => { c += s.v; pts.push(c); });
  const LW = 230, VW = 130, RH = 46, lo = Math.min(...pts) - 0.02, hi = Math.max(0, ...pts) + 0.01;
  const x = (v: number) => LW + ((v - lo) / (hi - lo)) * (W - LW - VW);
  const H = (steps.length + 2) * RH + 22;
  const bar = (i: number, label: string, sub: string, from: number, to: number, cls: string, value: string, note: string) => {
    const y = i * RH + 6;
    return (
      <g key={i}>
        <text className={`wf-label${cls === 'step' ? '' : ' strong'}`} x={0} y={y + 14}>{label}</text>
        {sub && <text className="wf-sub" x={0} y={y + 29}>{sub}</text>}
        <rect className={`wf-bar ${cls}`} x={Math.min(x(from), x(to))} y={y + 3} width={Math.max(3, Math.abs(x(to) - x(from)))} height={22} rx={6} />
        <text className={`wf-val ${cls}`} x={W - 52} y={y + 19} textAnchor="end">{value}</text>
        <text className="wf-note" x={W} y={y + 19} textAnchor="end">{note}</text>
      </g>
    );
  };
  c = base;
  const top = steps[0];
  return (
    <div className="wf">
      <div className="wf-ends">
        <div className="wf-pill"><div>Seoul average</div><b>{signed(base, 2)}</b><small>{asPct(base)}</small></div><span>→</span>
        {top && <><div className="wf-pill"><div>{top.label}</div><b className={top.v < 0 ? 'down' : 'up'}>{signed(top.v, 2)}</b></div><span>→</span></>}
        <div className="wf-pill end"><div>{place} · model{Number.isFinite(actual) ? ` (actual ${signed(actual, 2)})` : ''}</div><b>{signed(end, 2)}</b><small>{asPct(end)}</small></div>
      </div>
      <svg className="wf-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Why ${place}'s RHSI differs from Seoul's average`}>
        {niceTicks(lo, hi, false, 6).map((t) => (
          <g key={t}><line className={t === 0 ? 'wf-zero' : 'wf-grid'} x1={x(t)} x2={x(t)} y1={0} y2={H - 20} />
            <text className="wf-tick" x={x(t)} y={H - 6} textAnchor="middle">{signed(t, 2)}</text></g>
        ))}
        {bar(0, 'Seoul average', 'mean of 422 neighborhoods', 0, base, 'base', signed(base), asPct(base))}
        {steps.map((s, i) => {
          const from = c; c += s.v;
          return (
            <g key={s.label}>
              <line className="wf-link" x1={x(from)} x2={x(from)} y1={i * RH + 31} y2={(i + 1) * RH + 9} />
              {bar(i + 1, s.label, s.inputs, from, c, `step ${s.v < 0 ? 'down' : 'up'}`, signed(s.v), '')}
            </g>
          );
        })}
        <line className="wf-link" x1={x(c)} x2={x(c)} y1={steps.length * RH + 31} y2={(steps.length + 1) * RH + 9} />
        {bar(steps.length + 1, place, isGu ? 'model, mean of its neighborhoods' : 'model estimate', 0, end, 'end', signed(end), asPct(end))}
      </svg>
      {top && <p className="wf-say">The biggest reason is <b>{top.label} ({signed(top.v)})</b>
        {top.top && Math.abs(top.top.v) >= Math.abs(top.v) / 2 ? <> — mostly <b>{VAR_BY_KEY[top.top.k]?.full?.toLowerCase() ?? top.top.k} ({signed(top.top.v)})</b></> : null}.</p>}
    </div>
  );
}

// Our blue → grey → red, by rank within the row — low input values blue, high red.
const STOPS = [[59, 111, 209], [201, 201, 214], [224, 72, 78]];
const tint = (t: number) => {
  const [a, b, u] = t < 0.5 ? [STOPS[0], STOPS[1], t * 2] : [STOPS[1], STOPS[2], (t - 0.5) * 2];
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * u)).join(',')})`;
};
const rankColours = (vals: number[]) => {
  const sorted = vals.filter(Number.isFinite).sort((a, b) => a - b);
  return vals.map((v) => (Number.isFinite(v) ? tint(sorted.indexOf(v) / Math.max(1, sorted.length - 1)) : 'rgba(169,178,191,0.4)'));
};

// The beeswarm, in the six groups of the drawer's SHAP folders, drawn the way the shap
// library draws its summary plot: one row per input, dots spread up and down where they
// crowd, a zero line, numbers along the axis and the value key at the right. A group's own
// row is the sum of its inputs, in grey. Groups and their inputs run strongest first (for
// the focused place, else across Seoul); groups fold, the two strongest start open. The
// focused place is ringed, its value at the right.
const LABEL = 200, VALW = 60, KEY = 56, HEAD = 40, ROW = 36, R = 2.1, GAP = R * 2 + 0.3;
const PLOT_R = W - VALW - KEY;

function swarm(px: number[], half: number): number[] {
  const order = px.map((_, i) => i).filter((i) => Number.isFinite(px[i])).sort((a, b) => px[a] - px[b]);
  const dy = new Array(px.length).fill(0);
  let active: number[] = [];
  for (const i of order) {
    active = active.filter((j) => px[i] - px[j] < GAP);
    let y = 0;
    for (let k = 0; k < 60; k++) {
      y = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * GAP * 0.6;
      if (!active.some((j) => Math.hypot(px[i] - px[j], dy[j] - y) < GAP)) break;
    }
    dy[i] = Math.max(-half, Math.min(half, y));
    active.push(i);
  }
  return dy;
}

function Beeswarm({table, members, onPick}: {table: Table; members: number[] | null; onPick: (code: string) => void}) {
  // every row's dots and colours, built once per data load
  const rows = useMemo(() => {
    const groups = SHAP_GROUPS.map((g) => ({...g, sum: table.col(g.key),
      kids: g.inputs.map((k) => ({key: k, label: VAR_BY_KEY[k]?.short ?? k, shap: table.col(`shap_${k}`), value: table.col(k)}))}));
    const all = groups.flatMap((g) => g.kids.flatMap((k) => k.shap)).filter(Number.isFinite).sort((a, b) => a - b);
    const lo = all[Math.floor(all.length * 0.002)], hi = all[Math.floor(all.length * 0.998)];
    const X = (v: number) => LABEL + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * (PLOT_R - 10 - LABEL);
    const dotsOf = (vals: number[], h: number, colours: string[] | null, label: string) => {
      const px = vals.map(X), dy = swarm(px, h / 2 - 3);
      return {px, dy, els: px.map((x, i) => (Number.isFinite(x) ? (
        <circle key={i} cx={x.toFixed(1)} cy={dy[i].toFixed(1)} r={R} fill={colours ? colours[i] : 'rgba(169,178,191,0.55)'} onClick={() => onPick(table.codes[i])}>
          <title>{`${table.names[i]} · ${label} ${signed(vals[i])}`}</title>
        </circle>) : null))};
    };
    return {lo, hi, X, groups: groups.map((g) => ({...g, dots: dotsOf(g.sum, HEAD, null, `${g.label} (sum)`),
      kids: g.kids.map((k) => ({...k, dots: dotsOf(k.shap, ROW, rankColours(k.value), k.label)}))}))};
  }, [table]);   // eslint-disable-line react-hooks/exhaustive-deps

  const valueOf = (vals: number[]) => (members?.length ? mean(members.map((i) => vals[i])) : NaN);
  const meanAbs = (vals: number[]) => mean(vals.map(Math.abs));
  // strongest first: for the focused place, else across Seoul
  const ordered = useMemo(() => {
    const weight = (vals: number[]) => (members?.length ? Math.abs(valueOf(vals)) : meanAbs(vals));
    return rows.groups.map((g) => ({...g, kids: [...g.kids].sort((a, b) => weight(b.shap) - weight(a.shap))}))
      .sort((a, b) => weight(b.sum) - weight(a.sum));
  }, [rows, members]);   // eslint-disable-line react-hooks/exhaustive-deps
  // which groups are open: the two strongest until one is opened or folded
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const open = chosen ?? new Set(ordered.slice(0, 2).map((g) => g.key));
  const toggle = (key: string) => { const next = new Set(open); if (next.has(key)) next.delete(key); else next.add(key); setChosen(next); };

  const {X, lo, hi} = rows;
  const ring = (dots: {px: number[]; dy: number[]}, yc: number) => members?.map((i) => (Number.isFinite(dots.px[i])
    ? <circle key={i} className="shap-ring" cx={dots.px[i]} cy={yc + dots.dy[i]} r={4.2} /> : null));
  let y = 0;
  const parts: JSX.Element[] = [];
  for (const g of ordered) {
    const yc = y + HEAD / 2, isOpen = open.has(g.key);
    parts.push(
      <g key={g.key}>
        <rect className="shap-hit" x={0} y={y} width={W} height={HEAD} onClick={() => toggle(g.key)} />
        <line className="shap-sep" x1={0} x2={PLOT_R} y1={y} y2={y} />
        <foreignObject x={0} y={yc - 11} width={LABEL - 8} height={22}>
          <button className="shap-head" onClick={() => toggle(g.key)} aria-expanded={isOpen}>
            {isOpen ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
            {g.label} <span className="shap-n">({g.kids.length})</span>
          </button>
        </foreignObject>
        <g transform={`translate(0 ${yc})`}>{g.dots.els}</g>
        {ring(g.dots, yc)}
        <text className="shap-val strong" x={W - KEY - 6} y={yc + 4} textAnchor="end">{signed(valueOf(g.sum))}</text>
      </g>
    );
    y += HEAD;
    if (!isOpen) continue;
    for (const k of g.kids) {
      const yk = y + ROW / 2;
      parts.push(
        <g key={k.key}>
          <line className="shap-row" x1={LABEL} x2={PLOT_R - 10} y1={yk} y2={yk} />
          <text className="shap-label" x={LABEL - 12} y={yk + 4} textAnchor="end">{k.label}</text>
          <g transform={`translate(0 ${yk})`}>{k.dots.els}</g>
          {ring(k.dots, yk)}
          <text className="shap-val" x={W - KEY - 6} y={yk + 4} textAnchor="end">{signed(valueOf(k.shap))}</text>
        </g>
      );
      y += ROW;
    }
  }
  const H = y, gx = W - KEY + 14, kh = Math.min(160, H - 24);
  return (
    <>
      <svg className="shap-svg" viewBox={`0 0 ${W} ${H + 40}`} role="img" aria-label="SHAP contributions by group, every neighborhood">
        <line className="shap-zero" x1={X(0)} x2={X(0)} y1={0} y2={H} />
        {parts}
        {niceTicks(lo, hi, false, 6).map((t) => <text key={t} className="shap-axis" x={X(t)} y={H + 14} textAnchor="middle">{signed(t, 2)}</text>)}
        <text className="shap-axis" x={(LABEL + PLOT_R) / 2} y={H + 32} textAnchor="middle">SHAP value (impact on RHSI, log-ratio) — left: more sales lost in heat</text>
        <defs><linearGradient id="shap-key" x1="0" y1="1" x2="0" y2="0">
          {STOPS.map((c, k) => <stop key={k} offset={k / (STOPS.length - 1)} stopColor={`rgb(${c.join(',')})`} />)}</linearGradient></defs>
        <rect x={gx} y={12} width={8} height={kh} rx={2} fill="url(#shap-key)" />
        <text className="shap-axis" x={gx + 13} y={20}>High</text>
        <text className="shap-axis" x={gx + 13} y={12 + kh}>Low</text>
        <text className="shap-axis" x={gx + 34} y={12 + kh / 2} textAnchor="middle" transform={`rotate(-90 ${gx + 34} ${12 + kh / 2})`}>Input value</text>
      </svg>
      <div className="shap-legend"><span>dot = a neighborhood · a group's row is the sum of its inputs (gray) · click a group to open or fold it</span>
        {members?.length ? <span><i className="shap-ring-key" /> the focused place, its value at the right</span> : null}</div>
    </>
  );
}
