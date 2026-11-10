import {memo, useCallback, useMemo, useRef} from 'react';
import type {Variable} from '../data/catalog';
import type {Place} from '../data/uhus';
import type {Focus} from './Overlay';
import {valuesByPlace} from './focusValues';
import {dataIdFor, type Grain} from './layers';
import {BIVARIATE, dailyColoursOf, isBivariateLayer, thirdsOf} from './pair';
import {ourFilterId} from './ourFilters';

// The scatter shared by the 2D graph card and the dashboard: one variable on one axis as
// a beeswarm, two as x (B) against y (A). A dot is a place at the current grain.

export type Box = {W: number; H: number; pad: {l: number; r: number; t: number; b: number}; r: number};

// Each variable's value per place now — static ones as they are, daily ones on the
// playing day (the rows the time filter lets through).
// With the atlas's own filters (ourFilters.ts), a place one variable's range removed
// leaves every series, so the panels count and plot the same places as the map.
export function placeSeries(datasets: any, vars: Variable[], grain: Grain, filters: any[]) {
  const keyField = grain === 'dong' ? 'dong_code' : 'gu_code';
  const series = vars.map((x) => valuesByPlace(datasets?.[x.dataset === 'dong' ? grain : dataIdFor(x, grain)], x.key, keyField, filters));
  // (a range in Aggregate is on the period's table, not on the rows of the day: ourFilters.ts)
  const aggTable = datasets?.[`${grain}_agg`];
  const narrowed = vars.flatMap((x, i) => {
    const f = filters.find((o: any) => o.id === ourFilterId(x.key));
    return !f ? [] : [aggTable && (f.dataId || []).includes(aggTable.id) ? valuesByPlace(aggTable, x.key, keyField, filters) : series[i]];
  });
  if (!narrowed.length) return series;
  return series.map((s) => new Map([...s].filter(([code]) => narrowed.every((n) => n.has(code)))));
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
export type Scale = {px: (v: number) => number; lo: number; hi: number; sqrt: boolean};
export function scaleOf(values: number[], from: number, to: number): Scale {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
  const median = q(0.5), min = sorted[0], max = sorted[sorted.length - 1];
  const skewed = min >= 0 && max > 0 && median < max / 8;
  const f = (v: number) => (skewed ? Math.sign(v) * Math.sqrt(Math.abs(v)) : v);
  const loV = sorted.length > 20 ? q(0.02) : min, hiV = sorted.length > 20 ? q(0.98) : max;
  const lo = f(loV), hi = f(hiV), span = hi - lo || 1;
  return {px: (v: number) => from + Math.max(0, Math.min(1, (f(v) - lo) / span)) * (to - from), lo: loV, hi: hiV, sqrt: skewed};
}

// Round values to label an axis between lo and hi: an even step for a linear axis; 1-2-5
// steps for a square-root one, whose low end is stretched out.
export function niceTicks(lo: number, hi: number, sqrt = false, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  if (sqrt) {
    const out = lo <= 0 ? [0] : [];
    for (let e = Math.floor(Math.log10(Math.max(hi, 1e-9))) - 3; e <= Math.ceil(Math.log10(hi)); e++)
      for (const m of [1, 2, 5]) { const t = m * 10 ** e; if (t >= lo && t <= hi) out.push(t); }
    // keep the larger ones, which the square root spreads apart; drop the crowded small ones
    return out.length > count + 1 ? [out[0], ...out.slice(-count)] : out;
  }
  const raw = (hi - lo) / count, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) out.push(Math.abs(t) < step * 1e-9 ? 0 : +t.toPrecision(12));
  return out;
}

// The dot colours: the bivariate grid (thirds of each variable) when the map shows it,
// else the map layer's own ramp over A's quantiles, else one neutral ink.
export function colouring(series: Map<string, number>[], nVars: number, bivariate: boolean, ramp: string[] | null,
  byCode: Map<string, string> | null = null, colourBy = 0) {
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
    const by = series[colourBy] ?? series[0];
    const vals = [...by.values()].sort((p, q) => p - q);
    const cuts = ramp.slice(1).map((_, i) => vals[Math.min(vals.length - 1, Math.floor(((i + 1) / ramp.length) * vals.length))]);
    return (code: string) => {
      const v = by.get(code);
      if (v == null) return 'var(--ink-3)';
      let k = 0;
      while (k < cuts.length && v >= cuts[k]) k++;
      return ramp[k];
    };
  }
  return () => 'var(--ink-2)';
}

// The map's colouring, so a dot and its place share a colour.
export function useMapColours(series: Map<string, number>[], nVars: number, entries: {layer?: any; pairPart?: 'a' | 'b'}[]) {
  const layer = entries[0]?.layer;
  const bivariate = nVars === 2 && isBivariateLayer(layer);
  // the daily pair's colours change with the day; the dots take them place by place
  const byCode = dailyColoursOf(layer);
  const codeKey = byCode ? [...byCode.values()].join() : '';
  // (of a pair, the variable that colours the map: not always the first picked)
  const colourBy = Math.max(0, entries.findIndex((e) => e.pairPart === 'a'));
  const ramp: string[] | null = nVars === 1 || entries[0]?.pairPart ? layer?.config.visConfig?.colorRange?.colors ?? null : null;
  const colourOf = useMemo(() => colouring(series, nVars, bivariate, ramp, byCode, colourBy),
    [series, nVars, bivariate, ramp?.join(), codeKey, colourBy]);   // eslint-disable-line react-hooks/exhaustive-deps
  return {bivariate, colourOf};
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
      {/* numbers along both axes, for the larger chart; beyond them the dots sit on the edge */}
      {ticks && plot.sx && (
        <g className="gc-ticks">
          {niceTicks(plot.sx.lo, plot.sx.hi, plot.sx.sqrt).map((t) => (
            <g key={`x${t}`}>
              <line x1={plot.sx!.px(t)} x2={plot.sx!.px(t)} y1={pad.t} y2={H - pad.b} />
              <text className="gc-tick" x={plot.sx!.px(t)} y={H - pad.b + 11} textAnchor="middle">{short(t)}</text>
            </g>
          ))}
          {plot.sy && niceTicks(plot.sy.lo, plot.sy.hi, plot.sy.sqrt, 6).map((t) => (
            <g key={`y${t}`}>
              <line x1={pad.l} x2={W - pad.r} y1={plot.sy!.px(t)} y2={plot.sy!.px(t)} />
              <text className="gc-tick" x={pad.l - 4} y={plot.sy!.px(t) + 3} textAnchor="end">{short(t)}</text>
            </g>
          ))}
        </g>
      )}
      {/* the bivariate grid's thirds, the same cuts that colour the map */}
      {showCuts && plot.cuts && (
        <g className="gc-cuts">
          {plot.cuts.x.map((x, i) => <line key={`x${i}`} x1={x} x2={x} y1={pad.t} y2={H - pad.b} />)}
          {plot.cuts.y.map((y, i) => <line key={`y${i}`} x1={pad.l} x2={W - pad.r} y1={y} y2={y} />)}
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
      <text className="gc-axis" x={W - pad.r} y={H - 1} textAnchor="end">{(b ?? a).short}{ticks && plot.sx?.sqrt ? ' (√ scale)' : ''} →</text>
      {b && <text className="gc-axis" x={pad.l} y={1} dominantBaseline="hanging">↑ {a.short}{ticks && plot.sy?.sqrt ? ' (√ scale)' : ''}</text>}
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
  return a >= 1e8 ? `${(v / 1e8).toFixed(0)}억` : a >= 1e4 ? `${(v / 1e4).toFixed(0)}만` : a >= 10 ? v.toFixed(0)
    : a === 0 || a >= 0.1 ? v.toFixed(2) : String(+v.toPrecision(1));
};
