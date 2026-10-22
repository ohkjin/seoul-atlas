import {memo, useCallback, useRef} from 'react';
import type {Variable} from '../data/catalog';
import type {Place} from '../data/uhus';
import type {Focus} from './Overlay';
import {valuesByPlace} from './focusValues';
import {dataIdFor, type Grain} from './layers';
import {BIVARIATE, thirdsOf} from './pair';

// The scatter shared by the 2D graph card and the dashboard: one variable on one axis as
// a beeswarm, two as x (B) against y (A). A dot is a place at the current grain.

export type Box = {W: number; H: number; pad: {l: number; r: number; t: number; b: number}; r: number};

// Each variable's value per place now — static ones as they are, daily ones on the
// playing day (the rows the time filter lets through).
export function placeSeries(datasets: any, vars: Variable[], grain: Grain, filters: any[]) {
  const keyField = grain === 'dong' ? 'dong_code' : 'gu_code';
  return vars.map((x) => valuesByPlace(datasets?.[x.dataset === 'dong' ? grain : dataIdFor(x, grain)], x.key, keyField, filters));
}

// Positions: x always the last variable (B, or the only one), y the first (A) when two —
// else a beeswarm: each dot drops into the first free height near the axis's middle.
export function layoutScatter(places: Place[], series: Map<string, number>[], nVars: number, box: Box) {
  const {W, H, pad, r} = box;
  const at = new Map<string, [number, number]>();
  const rank = new Map<string, number>();
  const xs = series[nVars - 1], ys = nVars === 2 ? series[0] : null;
  const pts = places.filter((p) => xs?.has(p.code) && (!ys || ys.has(p.code)));
  if (!pts.length) return {at, rank, n: 0, cuts: null as null | {x: number[]; y: number[]}, sx: null as Scale | null, sy: null as Scale | null};
  const sx = scaleOf(pts.map((p) => xs!.get(p.code)!), pad.l + 6, W - pad.r - 6);
  if (ys) {
    const sy = scaleOf(pts.map((p) => ys.get(p.code)!), H - pad.b - 6, pad.t + 6);
    for (const p of pts) at.set(p.code, [sx.px(xs!.get(p.code)!), sy.px(ys.get(p.code)!)]);
    const tx = thirdsOf(pts.map((p) => xs!.get(p.code)!)), ty = thirdsOf(pts.map((p) => ys.get(p.code)!));
    return {at, rank, n: pts.length, cuts: {x: [sx.px(tx.t1), sx.px(tx.t2)], y: [sy.px(ty.t1), sy.px(ty.t2)]}, sx, sy};
  }
  const d = r * 2 + 0.6;
  const mid = (pad.t + H - pad.b) / 2;
  const sorted = [...pts].sort((p, q) => xs!.get(p.code)! - xs!.get(q.code)!);
  const placed: [number, number][] = [];
  for (const p of sorted) {
    const x = sx.px(xs!.get(p.code)!);
    let y = mid;
    for (let k = 0; k < 400; k++) {
      y = mid + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (d * 0.55);
      if (!placed.some(([px, py]) => Math.abs(px - x) < d && Math.abs(py - y) < d)) break;
    }
    y = Math.max(pad.t + 3, Math.min(H - pad.b - 3, y));
    placed.push([x, y]);
    at.set(p.code, [x, y]);
  }
  sorted.forEach((p, i) => rank.set(p.code, sorted.length - i));
  return {at, rank, n: pts.length, cuts: null, sx, sy: null};
}

// Linear, or square root (sign kept) when the values are skewed: a long right tail. The
// axis spans the 2nd–98th percentile — a handful of outliers squeezed every other dot into
// a sliver — and anything beyond sits on the edge.
export type Scale = {px: (v: number) => number; lo: number; hi: number};
export function scaleOf(values: number[], from: number, to: number): Scale {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
  const median = q(0.5), min = sorted[0], max = sorted[sorted.length - 1];
  const skewed = min >= 0 && max > 0 && median < max / 8;
  const f = (v: number) => (skewed ? Math.sign(v) * Math.sqrt(Math.abs(v)) : v);
  const loV = sorted.length > 20 ? q(0.02) : min, hiV = sorted.length > 20 ? q(0.98) : max;
  const lo = f(loV), hi = f(hiV), span = hi - lo || 1;
  return {px: (v: number) => from + Math.max(0, Math.min(1, (f(v) - lo) / span)) * (to - from), lo: loV, hi: hiV};
}

// The dot colours: the bivariate grid (thirds of each variable) when the map shows it,
// else the map layer's own ramp over A's quantiles, else one neutral ink.
export function colouring(series: Map<string, number>[], nVars: number, bivariate: boolean, ramp: string[] | null,
  byCode: Map<string, string> | null = null) {
  // the daily pair's grid: the map's own colour of the day, place by place
  if (byCode && nVars === 2) return (code: string) => byCode.get(code) ?? 'var(--ink-3)';
  if (bivariate && nVars === 2) {
    const la = thirdsOf([...series[0].values()]), lb = thirdsOf([...series[1].values()]);
    return (code: string) => {
      const i = la.level(series[0].get(code)), j = lb.level(series[1].get(code));
      return i == null || j == null ? 'var(--ink-3)' : BIVARIATE[i][j];
    };
  }
  if (ramp?.length) {
    const vals = [...series[0].values()].sort((p, q) => p - q);
    const cuts = ramp.slice(1).map((_, i) => vals[Math.min(vals.length - 1, Math.floor(((i + 1) / ramp.length) * vals.length))]);
    return (code: string) => {
      const v = series[0].get(code);
      if (v == null) return 'var(--ink-3)';
      let k = 0;
      while (k < cuts.length && v >= cuts[k]) k++;
      return ramp[k];
    };
  }
  return () => 'var(--ink-2)';
}

// Spearman's rank correlation of the places both variables have — ranks, not values, as
// sales and rain are far too skewed for a straight-line r.
export function spearman(a: Map<string, number>, b: Map<string, number>): number | null {
  const codes = [...a.keys()].filter((k) => b.has(k));
  if (codes.length < 5) return null;
  const rankOf = (m: Map<string, number>) => {
    const sorted = [...codes].sort((p, q) => m.get(p)! - m.get(q)!);
    const out = new Map<string, number>();
    for (let i = 0; i < sorted.length;) {   // ties share their mean rank
      let j = i;
      while (j + 1 < sorted.length && m.get(sorted[j + 1]) === m.get(sorted[i])) j++;
      for (let k = i; k <= j; k++) out.set(sorted[k], (i + j) / 2);
      i = j + 1;
    }
    return out;
  };
  const ra = rankOf(a), rb = rankOf(b);
  const n = codes.length, mean = (n - 1) / 2;
  let sab = 0, saa = 0, sbb = 0;
  for (const c of codes) {
    const x = ra.get(c)! - mean, y = rb.get(c)! - mean;
    sab += x * y; saa += x * x; sbb += y * y;
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
}

// Whether a place is the focus — or, under Dong detail, one of the focused district's.
export function focusTest(focus: Focus, grain: Grain) {
  const code = focus.level === 'seoul' ? null : grain === 'dong' && focus.level === 'dong' ? focus.dong.code : focus.gu.code;
  const test = (p: Place) => focus.level === 'seoul' ? false
    : grain === 'dong' && focus.level === 'gu' ? p.guCode === focus.gu.code : p.code === code;
  return {code, test};
}

type ScatterProps = {
  places: Place[]; series: Map<string, number>[]; vars: Variable[]; box: Box; plot: ReturnType<typeof layoutScatter>;
  colourOf: (code: string) => string; showCuts: boolean; focus: Focus; grain: Grain; playing: boolean;
  className?: string; ticks?: boolean;
  onHover: (code: string | null) => void; onPick: (level: 'dong' | 'gu', code: string) => void;
};

// Memoised: the map's store changes many times a second while time plays, and every
// change re-renders the overlay; redrawing hundreds of dots that did not move was what
// held playback down with the dashboard open. Callers keep their props stable.
export const Scatter = memo(function Scatter({places, vars, box, plot, colourOf, showCuts, focus, grain, playing, className, ticks, onHover, onPick}: ScatterProps) {
  const {W, H, pad, r} = box;
  const [a, b] = vars;
  const {code: focusCode, test: inFocus} = focusTest(focus, grain);
  return (
    <svg className={`gc-plot${playing ? ' playing' : ''}${className ? ` ${className}` : ''}`} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={b ? `${a.short} against ${b.short}, one dot per place` : `Spread of ${a.short}, one dot per place`}
      onMouseLeave={() => onHover(null)}>
      {/* the bivariate grid's thirds, the same cuts that colour the map */}
      {showCuts && plot.cuts && (
        <g className="gc-cuts">
          {plot.cuts.x.map((x) => <line key={`x${x}`} x1={x} x2={x} y1={pad.t} y2={H - pad.b} />)}
          {plot.cuts.y.map((y) => <line key={`y${y}`} x1={pad.l} x2={W - pad.r} y1={y} y2={y} />)}
        </g>
      )}
      {places.map((p) => {
        const at = plot.at.get(p.code);
        if (!at) return null;
        const focused = inFocus(p);
        return (
          <circle key={p.code} r={focused ? r + 1.6 : r} cx={0} cy={0}
            className={focused ? 'gc-dot focus' : focusCode ? 'gc-dot dim' : 'gc-dot'}
            style={{transform: `translate(${at[0]}px, ${at[1]}px)`, fill: colourOf(p.code)}}
            onMouseEnter={() => onHover(p.code)} onClick={() => onPick(grain, p.code)} />
        );
      })}
      <text className="gc-axis" x={W - pad.r} y={H - 1} textAnchor="end">{(b ?? a).short} →</text>
      {b && <text className="gc-axis" x={pad.l} y={1} dominantBaseline="hanging">↑ {a.short}</text>}
      {/* the visible range's ends, for the larger chart */}
      {ticks && plot.sx && (
        <>
          <text className="gc-tick" x={pad.l + 6} y={H - 1}>{short(plot.sx.lo)}</text>
          {plot.sy && <text className="gc-tick" x={pad.l} y={H - pad.b - 8}>{short(plot.sy.lo)}</text>}
          {plot.sy && <text className="gc-tick" x={pad.l} y={pad.t + 14}>{short(plot.sy.hi)}</text>}
        </>
      )}
    </svg>
  );
});

// A callback that keeps one identity while always calling the latest function — so a
// memoised child is not re-rendered just because its parent made a new arrow.
export function useStableCallback<A extends unknown[]>(fn: (...args: A) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}

const short = (v: number) => {
  const a = Math.abs(v);
  return a >= 1e8 ? `${(v / 1e8).toFixed(0)}억` : a >= 1e4 ? `${(v / 1e4).toFixed(0)}만` : a >= 10 ? v.toFixed(0) : v.toFixed(2);
};
