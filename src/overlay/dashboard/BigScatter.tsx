import {useMemo, useState} from 'react';
import type {Variable} from '../../data/catalog';
import type {Place} from '../../data/uhus';
import {fmt} from '../focusValues';
import {Scatter, focusTest, layoutScatter, niceTicks, spearman, useMapColours, useStableCallback, type Box} from '../scatter';
import type {DashCtx} from './Dashboard';

// The 2D graph card's scatter, large, with numbers along both axes, and for two variables
// Spearman's ρ — how strongly the two rank places alike — said in words too. One variable
// is a histogram instead: how many places at each level, the focused one's bar in white.
export default function BigScatter({ctx}: {ctx: DashCtx}) {
  const {vars, places, series, grain, focus, playing, entries, onPick} = ctx;
  const [hover, setHover] = useState<string | null>(null);
  const [a, b] = vars;
  const box: Box = useMemo(() => ({W: 520, H: 280, pad: {l: 34, r: 6, t: 18, b: 26}, r: grain === 'dong' ? 3 : 6}), [grain]);
  const pick = useStableCallback(onPick);
  const {bivariate, colourOf} = useMapColours(series, vars.length, entries);
  const plot = useMemo(() => layoutScatter(places, series, vars.length, box),
    [places, series, vars.length, grain]);   // eslint-disable-line react-hooks/exhaustive-deps
  const rho = useMemo(() => (b ? spearman(series[0], series[1]) : null), [series, b]);

  if (!a) return <p className="dash-empty">Link a variable to see how its places spread.</p>;
  if (!b) return <Histogram ctx={ctx} />;
  if (!plot.n) return <p className="dash-empty">Loading the values…</p>;
  const shown = hover ?? focusTest(focus, grain).code;
  const place: Place | undefined = shown ? places.find((p) => p.code === shown) : undefined;
  return (
    <>
      <Scatter places={places} series={series} vars={vars} box={box} plot={plot} colourOf={colourOf} showCuts={bivariate}
        focus={focus} grain={grain} playing={playing} ticks onHover={setHover} onPick={pick} />
      <div className="gc-caption">
        {place ? (
          <>
            <span className="gc-name">{place.name}</span>
            {vars.map((x: Variable, i) => <span key={x.key}>{fmt(series[i].get(place.code) ?? null)}{x.unit !== 'ratio' ? ` ${x.unit}` : ''}</span>)}
          </>
        ) : <span className="gc-hint">{plot.n} places · hover a dot, click to focus</span>}
        {rho != null && <span className="gc-rank" title="Spearman rank correlation across the places">ρ = {rho.toFixed(2)} · {rhoWords(rho)}</span>}
      </div>
    </>
  );
}

// ρ in words: how strongly, and which way
function rhoWords(r: number) {
  const m = Math.abs(r);
  if (m < 0.1) return 'no clear link';
  const way = r > 0 ? 'higher with higher' : 'lower with higher';
  return `${m < 0.3 ? 'weak' : m < 0.5 ? 'moderate' : 'strong'}, ${way}`;
}

// One variable: the places counted into even bins between its lowest and highest value,
// the median dashed, the bin of the focused place (or of the focused district's dongs) white.
function Histogram({ctx}: {ctx: DashCtx}) {
  const {vars, places, series, focus, grain} = ctx;
  const [hover, setHover] = useState<number | null>(null);
  const x0 = vars[0], values = series[0];
  const W = 520, H = 280, P = {l: 34, r: 6, t: 18, b: 26};
  const model = useMemo(() => {
    const vals = [...(values?.values() ?? [])].filter(Number.isFinite).sort((p, q) => p - q);
    if (!vals.length) return null;
    const lo = vals[0], hi = vals[vals.length - 1];
    const edges = niceTicks(lo, hi, false, 18);
    if (edges[0] > lo) edges.unshift(edges[0] - (edges[1] - edges[0]));
    if (edges[edges.length - 1] < hi || edges.length < 2) edges.push(edges[edges.length - 1] + (edges[1] - edges[0] || 1));
    const counts = new Array(edges.length - 1).fill(0);
    const binOf = (v: number) => { const i = edges.findIndex((e, k) => v >= e && v < edges[k + 1]); return i < 0 ? counts.length - 1 : Math.min(i, counts.length - 1); };
    for (const v of vals) counts[binOf(v)]++;
    return {edges, counts, binOf, median: vals[Math.floor(vals.length / 2)], max: Math.max(...counts)};
  }, [values]);
  if (!model) return <p className="dash-empty">Loading the values…</p>;
  const {edges, counts, binOf, median, max} = model;
  const x = (v: number) => P.l + ((v - edges[0]) / (edges[edges.length - 1] - edges[0])) * (W - P.l - P.r);
  const yTicks = niceTicks(0, max, false, 4), top = Math.max(max, yTicks[yTicks.length - 1]);
  const y = (n: number) => H - P.b - (n / top) * (H - P.b - P.t);
  const {test} = focusTest(focus, grain);
  const lit = new Set(places.filter((p) => test(p) && values.has(p.code)).map((p) => binOf(values.get(p.code)!)));
  const xTicks = niceTicks(edges[0], edges[edges.length - 1], false, 6);
  const shown = hover ?? (lit.size === 1 ? [...lit][0] : null);
  return (
    <>
      <svg className="gc-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`How many places at each level of ${x0.short}`} onMouseLeave={() => setHover(null)}>
        <g className="gc-ticks">
          {yTicks.map((t) => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} /><text className="gc-tick" x={P.l - 4} y={y(t) + 3} textAnchor="end">{t}</text></g>)}
          {xTicks.map((t) => <text key={t} className="gc-tick" x={x(t)} y={H - P.b + 11} textAnchor="middle">{fmt(t)}</text>)}
        </g>
        {counts.map((n, i) => (
          <rect key={i} className={`hg-bar${lit.has(i) ? ' focus' : ''}`} x={x(edges[i]) + 0.75} width={Math.max(1, x(edges[i + 1]) - x(edges[i]) - 1.5)}
            y={y(n)} height={y(0) - y(n)} rx={2} onMouseEnter={() => setHover(i)} />
        ))}
        <line className="hg-median" x1={x(median)} x2={x(median)} y1={P.t} y2={H - P.b} />
        <text className="gc-tick" x={x(median) + 4} y={P.t + 8}>median {fmt(median)}</text>
        <text className="gc-axis" x={W - P.r} y={H - 1} textAnchor="end">{x0.short} →</text>
        <text className="gc-axis" x={P.l} y={1} dominantBaseline="hanging">↑ {grain === 'dong' ? 'Neighborhoods' : 'Districts'}</text>
      </svg>
      <div className="gc-caption">
        {shown != null
          ? <><span className="gc-name">{fmt(edges[shown])} – {fmt(edges[shown + 1])}{x0.unit !== 'ratio' ? ` ${x0.unit}` : ''}</span><span>{counts[shown]} places</span></>
          : <span className="gc-hint">{places.filter((p) => values.has(p.code)).length} places · hover a bar</span>}
      </div>
    </>
  );
}
