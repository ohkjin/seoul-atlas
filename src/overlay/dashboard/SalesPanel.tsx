import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {INDUSTRY_KEYS, SALES_GROUP_KEYS, VAR_BY_KEY, childrenOf} from '../../data/catalog';
import {industrySeries, isIndustry, loadIndustries} from '../../data/industries';
import {seriesByDay} from '../focusValues';
import type {DashCtx} from './Dashboard';

// Sales — the year, and the heat. When sales lead the selection, the dashboard's wide panel
// is this instead of the SHAP beeswarms: the selected sales line's year for the focused place,
// large, heat days shaded and the heat-day and mild-day means dashed, with the answer beside
// it (how much a heat day sells against a mild day, here and in a typical neighbourhood);
// under it the line's parts — retail sales: the six sectors; a sector: its industries; an
// industry: its sector's, itself marked — each a small year, worst hit first, and at the
// right, in words, which industries fell most and rose most. Mockup: mockups/sales-time2.png (C).
const DAY = 86400000;
// heights in pixels; the width is the column's own, measured, so text stays its size
const BIG = 190, SMALL = 44, GAP = 6;
// under ₩100,000 a mild day a few card payments swing the ratio: left out, as in the mockups
const MIN_DAILY = 100000;

export const isSalesKey = (key: string) => key === 'retail_total_amount' || SALES_GROUP_KEYS.includes(key) || isIndustry(key);

// every place's heat-day and mild-day means per industry (scripts/build-sales-heat.mjs)
type Heat = {ind: string[]; dong: Record<string, number[]>; gu: Record<string, number[]>; seoul: number[]};
let heatFile: Promise<Heat> | null = null;
const loadHeat = () => (heatFile ??= fetch('/data/sales_heat.json').then((r) => r.json()));

const nameOf = (key: string) => (VAR_BY_KEY[key]?.short ?? key).replace(/ \(daily\)$/, '');
const pct = (lr: number) => (Number.isFinite(lr) ? `${lr >= 0 ? '+' : '−'}${Math.abs((Math.exp(lr) - 1) * 100).toFixed(0)}%` : '—');
const won = (v: number) => (!Number.isFinite(v) ? '—' : v >= 1e9 ? `₩${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `₩${(v / 1e6).toFixed(1)}M` : `₩${Math.round(v / 1e3)}k`);
const tone = (lr: number) => (!Number.isFinite(lr) ? '' : lr < 0 ? 'fell' : 'rose');
const ratio = (hot: number, mild: number) => (hot > 0 && mild >= MIN_DAILY ? Math.log(hot / mild) : NaN);

// what the selected line breaks into, and the industries its words range over
function partsOf(key: string): {parts: string[]; head: string; industries: string[]} {
  if (key === 'retail_total_amount') return {parts: SALES_GROUP_KEYS, head: 'All card sales, by sector', industries: INDUSTRY_KEYS};
  const sector = isIndustry(key) ? VAR_BY_KEY[key].parent! : key;
  const kids = childrenOf(sector).map((x) => x.key);
  return {parts: kids, head: `${nameOf(sector)}, by industry`, industries: kids};
}

// one year as SVG: heat days as red columns, mild days as blue ticks along the foot, the
// daily line faint under its 7-day mean; the 2nd–98th percentile of the days fills the height
function Year({W, vals, hot, mild, y0, h, name, change, big, marked, today}: {W: number; vals: number[]; hot: boolean[]; mild: boolean[];
  y0: number; h: number; name: string; change?: number; big?: boolean; marked?: boolean; today?: number}) {
  const n = vals.length, X = (i: number) => (i / (n - 1)) * W;
  const q = vals.filter(Number.isFinite).sort((a, b) => a - b);
  const lo = q[Math.floor(q.length * 0.02)] ?? 0, hi = q[Math.floor(q.length * 0.98)] ?? 1;
  const top = big ? 22 : 18, Y = (v: number) => y0 + h - 4 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * (h - top);
  const week = vals.map((_, i) => { let s = 0, c = 0; for (let j = i - 3; j <= i + 3; j++) if (Number.isFinite(vals[j])) { s += vals[j]; c++; } return c ? s / c : NaN; });
  const line = (v: number[]) => v.map((x, i) => (Number.isFinite(x) ? `${X(i).toFixed(1)},${Y(x).toFixed(1)}` : '')).filter(Boolean).join(' ');
  const mean = (m: boolean[]) => { let s = 0, c = 0; vals.forEach((x, i) => { if (m[i] && Number.isFinite(x)) { s += x; c++; } }); return c ? s / c : NaN; };
  const cw = Math.max(1.4, W / n);
  return (
    <g>
      {hot.map((b, i) => (b ? <rect key={i} className="sp-heat" x={X(i) - cw / 2} y={y0} width={cw} height={h} /> : null))}
      {mild.map((b, i) => (b ? <rect key={i} className="sp-mild" x={X(i)} y={y0 + h - 2} width={1.4} height={2} /> : null))}
      <line className="sp-base" x1={0} x2={W} y1={y0 + h} y2={y0 + h} />
      <polyline className="sp-day" points={line(vals)} />
      <polyline className={`sp-week${big ? ' big' : ''}`} points={line(week)} />
      {big && <line className="sp-mean mild" x1={0} x2={W} y1={Y(mean(mild))} y2={Y(mean(mild))} />}
      {big && <line className="sp-mean hot" x1={0} x2={W} y1={Y(mean(hot))} y2={Y(mean(hot))} />}
      {today != null && today >= 0 && today < n && <line className="sp-today" x1={X(today)} x2={X(today)} y1={y0} y2={y0 + h} />}
      <text className={`sp-name${big ? ' big' : ''}${marked ? ' marked' : ''}`} x={0} y={y0 + 11}>{name}</text>
      {change !== undefined && <text className={`sp-chg ${tone(change)}`} x={W} y={y0 + 11} textAnchor="end">{pct(change)}</text>}
    </g>
  );
}

function Months({W, y}: {W: number; y: number}) {
  return <>{'JFMAMJJASOND'.split('').map((m, k) => (
    <text key={k} className="sp-month" x={((Date.UTC(2024, k, 1) - Date.UTC(2024, 0, 1)) / DAY / 365) * W + 2} y={y}>{m}</text>
  ))}</>;
}

export default function SalesPanel({ctx}: {ctx: DashCtx}) {
  const {focus, grain, datasets, vars, day} = ctx;
  const key = vars[0]?.key ?? 'retail_total_amount';
  const {parts, head, industries} = partsOf(key);

  // the charts' column width, measured from the grid cell that holds the large year
  const [W, setW] = useState(640);
  const ro = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    ro.current = new ResizeObserver(() => { const w = Math.round(el.clientWidth); if (w > 200) setW((cur) => (Math.abs(cur - w) > 2 ? w : cur)); });
    ro.current.observe(el);
  }, []);


  // the focused place, read where its rows are: its own dong where loaded, else its district
  const byDong = focus.level === 'dong' && grain === 'dong' && !!datasets?.dong_daily;
  const table = byDong ? datasets.dong_daily : datasets?.gu_daily;
  const level: 'seoul' | 'gu' | 'dong' = focus.level === 'seoul' ? 'seoul' : byDong ? 'dong' : 'gu';
  const keyField = level === 'seoul' ? null : level === 'dong' ? 'dong_code' : 'gu_code';
  const code = level === 'seoul' ? null : level === 'dong' ? (focus as any).dong.code : (focus as any).gu.code;
  const placeName = level === 'seoul' ? 'Seoul' : level === 'dong' ? (focus as any).dong.name : (focus as any).gu.name;

  // the industry files this view reads (its own and its parts), and the means file
  const [loads, setLoads] = useState(0);
  const needed = [key, ...parts].filter(isIndustry);
  useEffect(() => {
    let live = true;
    loadIndustries(needed).then(() => live && setLoads((n) => n + 1)).catch((e) => console.error('industry sales failed to load', e));
    return () => { live = false; };
  }, [needed.join()]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [heat, setHeat] = useState<Heat | null>(null);
  useEffect(() => { loadHeat().then(setHeat).catch((e) => console.error('sales heat means failed to load', e)); }, []);

  // the years: the selected line and its parts, with the place's heat and mild days
  const model = useMemo(() => {
    if (!table) return null;
    const hs = seriesByDay(table, 'is_hot', keyField, code, 'mean'), ms = seriesByDay(table, 'is_mild', keyField, code, 'mean');
    if (!hs || !ms) return null;
    const hot = hs.vals.map((v) => v >= 0.5), mild = ms.vals.map((v) => v >= 0.5);
    const yearOf = (k: string) => (isIndustry(k) ? industrySeries(k, level, code) : seriesByDay(table, k, keyField, code, 'sum')?.vals ?? null);
    const meanOf = (v: number[], m: boolean[]) => { let s = 0, c = 0; v.forEach((x, i) => { if (m[i] && Number.isFinite(x)) { s += x; c++; } }); return c ? s / c : NaN; };
    const lineOf = (k: string) => {
      const vals = yearOf(k);
      if (!vals) return null;
      const h = meanOf(vals, hot), m = meanOf(vals, mild);
      return {key: k, vals, hot: h, mild: m, lr: ratio(h, m)};
    };
    const rows = parts.map(lineOf).filter(Boolean) as NonNullable<ReturnType<typeof lineOf>>[];
    rows.sort((a, b) => (Number.isFinite(a.lr) ? a.lr : 9) - (Number.isFinite(b.lr) ? b.lr : 9));
    return {start: hs.start, hot, mild, own: lineOf(key), rows, complete: rows.length === parts.length};
  }, [table?.dataContainer, keyField, code, key, loads]);   // eslint-disable-line react-hooks/exhaustive-deps

  // in words: the place's industries that fell and rose most, and Seoul's typical neighbourhood
  const words = useMemo(() => {
    if (!heat) return null;
    const idx = new Map(heat.ind.map((k, i) => [k, i])), K = heat.ind.length;
    const row = level === 'seoul' ? heat.seoul : heat[level][code ?? ''];
    const lrIn = (r: number[] | undefined, keys: string[]) => {
      if (!r) return NaN;
      const ids = keys.map((k) => idx.get(k)).filter((i): i is number => i != null);
      return ratio(ids.reduce((s, i) => s + r[i], 0), ids.reduce((s, i) => s + r[K + i], 0));
    };
    const ownKeys = SALES_GROUP_KEYS.includes(key) ? childrenOf(key).map((x) => x.key) : [key];
    const typical = Object.values(heat.dong).map((r) => lrIn(r, ownKeys)).filter(Number.isFinite).sort((a, b) => a - b);
    const each = industries.map((k) => ({key: k, lr: lrIn(row, [k])})).filter((x) => Number.isFinite(x.lr));
    return {
      typical: typical.length ? typical[Math.floor(typical.length / 2)] : NaN,
      fell: each.filter((x) => x.lr < 0).sort((a, b) => a.lr - b.lr).slice(0, 4),
      rose: each.filter((x) => x.lr > 0).sort((a, b) => b.lr - a.lr).slice(0, 4),
      small: industries.length - each.length,
    };
  }, [heat, level, code, key, industries.join()]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the years are hundreds of points each: drawn once per place and selection, not per day
  const smallYears = useMemo(() => model && (
    <>
      {model.rows.map((r, k) => (
        <Year key={r.key} W={W} vals={r.vals} hot={model.hot} mild={model.mild} y0={k * (SMALL + GAP)} h={SMALL}
          name={nameOf(r.key)} change={r.lr} marked={r.key === key} />
      ))}
      <Months W={W} y={model.rows.length * (SMALL + GAP) + 6} />
    </>
  ), [model, key, W]);
  const bigYear = useMemo(() => model?.own && (
    <Year W={W} vals={model.own.vals} hot={model.hot} mild={model.mild} y0={0} h={BIG - 16} name={`${nameOf(key)} · ${placeName}`} big />
  ), [model, key, placeName, W]);

  if (!model) return <p className="dash-empty">Loading the daily values…</p>;
  const own = model.own;
  if (!own) return <p className="dash-empty">Loading {nameOf(key)}…</p>;
  const today = Math.round((day * DAY - model.start) / DAY);
  const worst = model.rows.find((r) => Number.isFinite(r.lr) && r.lr < 0), best = [...model.rows].reverse().find((r) => Number.isFinite(r.lr) && r.lr >= 0);
  const nHot = model.hot.filter(Boolean).length, nMild = model.mild.filter(Boolean).length;
  const smallH = model.rows.length * (SMALL + GAP) + 10;
  const X = (i: number) => (i / (own.vals.length - 1)) * W;
  return (
    <div className="sales">
      <div className="sp-top">
        <div ref={measure}><svg viewBox={`0 0 ${W} ${BIG}`} width={W} height={BIG} className="sp-svg" role="img"
          aria-label={`${nameOf(key)} every day of 2024, ${placeName}, heat days shaded`}>
          {bigYear}
          {today >= 0 && today < own.vals.length && <line className="sp-today" x1={X(today)} x2={X(today)} y1={0} y2={BIG - 16} />}
          <Months W={W} y={BIG - 2} />
        </svg></div>
        <div className="sp-read">
          <div className={`sp-big ${tone(own.lr)}`}>{pct(own.lr)}</div>
          {Number.isFinite(own.lr)
            ? <p>{nameOf(key)} on a heat day against a mild day, {placeName}</p>
            : <p>Too little sold on a mild day here to compare (under ₩100k)</p>}
          <p className="sp-means">
            <span className="hot"><i className="sp-dash hot" />heat day {won(own.hot)}</span>
            <span className="mild"><i className="sp-dash mild" />mild day {won(own.mild)}</span>
          </p>
          {words && <p>a typical Seoul neighbourhood: <b className={tone(words.typical)}>{pct(words.typical)}</b></p>}
          <p className="dim">{nHot} heat days · {nMild} mild days in 2024</p>
        </div>
      </div>
      <div className="sp-sub">{head}</div>
      <div className="sp-break">
        <svg viewBox={`0 0 ${W} ${smallH}`} width={W} height={smallH} className="sp-svg">{smallYears}</svg>
        <div className="sp-words">
          {!model.complete && <p className="dim">Loading the industries…</p>}
          <p className="dim">On heat days, here…</p>
          {worst && <p><span className="fell">{nameOf(worst.key)}</span> fell most: {pct(worst.lr)}</p>}
          {best && <p><span className="rose">{nameOf(best.key)}</span> {best.lr > 0.005 ? 'rose' : 'held'}: {pct(best.lr)}</p>}
          {words && words.fell.length > 0 && <>
            <h4 className="fell">Fell most</h4>
            {words.fell.map((x) => <p key={x.key}>{nameOf(x.key)} <b className="fell">{pct(x.lr)}</b></p>)}
          </>}
          {words && words.rose.length > 0 && <>
            <h4 className="rose">Rose most</h4>
            {words.rose.map((x) => <p key={x.key}>{nameOf(x.key)} <b className="rose">{pct(x.lr)}</b></p>)}
          </>}
          {words && words.small > 0 && <p className="dim">{words.small} industr{words.small === 1 ? 'y sells' : 'ies sell'} under ₩100k a mild day here, left out</p>}
        </div>
      </div>
      <div className="shap-legend">
        <span><i className="sp-key heat" />heat day (feels-like ≥ 33 °C)</span>
        <span><i className="sp-key mild" />mild day</span>
        <span>line: daily sales, bold 7-day mean</span>
        <span><i className="sp-dash hot" /><i className="sp-dash mild" />heat-day and mild-day means</span>
        <span>% : a heat day against a mild day</span>
      </div>
    </div>
  );
}
