import {useEffect, useMemo, useState} from 'react';
import {VAR_BY_KEY, VARIABLES} from '../../data/catalog';
import {dailyOver, isIndustry, loadIndustries} from '../../data/industries';
import {fmt, seriesByDay} from '../focusValues';
import {Year, useColumnWidth} from './SalesPanel';
import type {DashCtx} from './Dashboard';

// A public daily dataset — the subway, buses, bikes, the people present — over the time ruler's
// period. When one leads the selection, the wide panel is the Sales panel's frame for it: the
// variable's days for the focused place, large, Seoul's typical neighbourhood dashed under it and
// heat days shaded where the weather has them (2024); beside it the period's daily mean against
// Seoul's, its busiest day, a heat day against a mild day and, over more than one year, each
// year's mean against the year before; under it the theme's other public daily datasets, a small
// row each, ending in how far the place sits from Seoul. The axis is months over a year or so,
// years over more. Built without a mockup at the user's word; the frame is the Sales panel's.
const DAY = 86400000;
const BIG = 190, SMALL = 44, GAP = 6;
export const isDailyPublicKey = (key: string) => !!VAR_BY_KEY[key]?.file && !isIndustry(key);

const nameOf = (key: string) => (VAR_BY_KEY[key]?.short ?? key).replace(/ \(daily\)$/, '');
const mean = (v: number[]) => { const f = v.filter(Number.isFinite); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN; };
const median = (v: number[]) => { const f = v.filter(Number.isFinite).sort((a, b) => a - b); return f.length ? f[f.length >> 1] : NaN; };
const pct = (r: number) => (Number.isFinite(r) ? `${r >= 0 ? '+' : '−'}${Math.abs(r * 100).toFixed(0)}%` : '—');
const tone = (r: number) => (!Number.isFinite(r) || Math.abs(r) < 0.005 ? '' : r < 0 ? 'fell' : 'rose');

// month letters over a year or so, years over more (every other one past a dozen)
function DateAxis({W, from, n, y}: {W: number; from: number; n: number; y: number}) {
  const X = (t: number) => ((t - from) / DAY / Math.max(1, n - 1)) * W;
  const first = new Date(from), last = new Date(from + (n - 1) * DAY), ticks: [number, string][] = [];
  if (n <= 430) {
    for (let d = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1); d <= last.getTime(); d = Date.UTC(new Date(d).getUTCFullYear(), new Date(d).getUTCMonth() + 1, 1))
      if (d >= from) ticks.push([d, new Date(d).getUTCMonth() === 0 && n > 370 ? String(new Date(d).getUTCFullYear()) : 'JFMAMJJASOND'[new Date(d).getUTCMonth()]]);
  } else {
    const years = last.getUTCFullYear() - first.getUTCFullYear(), step = years > 12 ? 2 : 1;
    for (let yr = first.getUTCFullYear(); yr <= last.getUTCFullYear(); yr += step) { const d = Date.UTC(yr, 0, 1); if (d >= from) ticks.push([d, String(yr)]); }
  }
  return <>{ticks.map(([t, s]) => <text key={t} className="sp-month" x={X(t) + 2} y={y}>{s}</text>)}</>;
}

export default function DailyPanel({ctx, dailyKey: key}: {ctx: DashCtx; dailyKey: string}) {
  const {focus, grain, datasets, day, period} = ctx;
  const v = VAR_BY_KEY[key];
  const [W, measure] = useColumnWidth();
  // the theme's public daily datasets: the one linked first, then the others
  const keys = useMemo(() => [key, ...VARIABLES.filter((x) => x.theme === v?.theme && isDailyPublicKey(x.key) && x.key !== key).map((x) => x.key)],
    [key, v?.theme]);
  const [loads, setLoads] = useState(0);
  // after Overlay's own effect has set the period's years (a parent's effects run after its
  // children's), so the years beyond 2024 load too
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => loadIndustries(keys).then(() => live && setLoads((n) => n + 1))
      .catch((e) => console.error('daily data failed to load', e)));
    return () => { live = false; clearTimeout(t); };
  }, [keys.join(), period[0], period[1]]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the focused place: a neighbourhood at its own rows where the map is by neighbourhood, else its
  // district (a district's own rows), or every district summed for Seoul
  const level: 'seoul' | 'gu' | 'dong' = focus.level === 'seoul' ? 'seoul' : focus.level === 'dong' && grain === 'dong' ? 'dong' : 'gu';
  const code = level === 'seoul' ? null : level === 'dong' ? (focus as any).dong.code : (focus as any).gu.code;
  const placeName = level === 'seoul' ? 'Seoul' : level === 'dong' ? (focus as any).dong.name : (focus as any).gu.name;
  const peersOf = level === 'gu' ? 'district' : 'neighbourhood';

  // the period, cut to the days the linked variable has files for
  const [from, to] = useMemo(() => {
    const r = v?.years;
    const lo = r ? Math.max(period[0], Date.UTC(r[0], 0, 1)) : Math.max(period[0], Date.UTC(2024, 0, 1));
    const hi = r ? Math.min(period[1], Date.UTC(r[1] + 1, 0, 1)) : Math.min(period[1], Date.UTC(2025, 0, 1));
    return hi > lo ? [lo, hi] : [Date.UTC(2024, 0, 1), Date.UTC(2025, 0, 1)];
  }, [period[0], period[1], v?.years?.join()]);   // eslint-disable-line react-hooks/exhaustive-deps
  const n = Math.round((to - from) / DAY);

  // heat and mild days by date, from the weather on the daily tables (2024)
  const flags = useMemo(() => {
    const table = level === 'dong' ? datasets?.dong_daily : datasets?.gu_daily;
    const kf = level === 'seoul' ? null : level === 'dong' ? 'dong_code' : 'gu_code';
    const hs = seriesByDay(table, 'is_hot', kf, code, 'mean'), ms = seriesByDay(table, 'is_mild', kf, code, 'mean');
    const hot = new Array(n).fill(false), mild = new Array(n).fill(false);
    if (hs && ms) hs.vals.forEach((h, i) => {
      const j = Math.round((hs.start + i * DAY - from) / DAY);
      if (j >= 0 && j < n) { hot[j] = h >= 0.5; mild[j] = ms.vals[i] >= 0.5; }
    });
    return {hot, mild};
  }, [datasets?.dong_daily?.dataContainer, datasets?.gu_daily?.dataContainer, level, code, from, n]);   // eslint-disable-line react-hooks/exhaustive-deps

  // each dataset's days for the place and for Seoul's typical place (the median of each day)
  const rows = useMemo(() => keys.map((k) => {
    const all = dailyOver(k, level === 'gu' ? 'gu' : level === 'dong' ? 'dong' : 'gu', from, to);
    if (!all.size) return null;
    const lists = [...all.values()];
    const own = level === 'seoul'
      ? Array.from({length: n}, (_, i) => { let s = 0, c = 0; for (const l of lists) if (Number.isFinite(l[i])) { s += l[i]; c++; } return c ? s : NaN; })
      : all.get(code ?? '') ?? null;
    if (!own || !own.some(Number.isFinite)) return null;
    const seoul = level === 'seoul' ? null : Array.from({length: n}, (_, i) => median(lists.map((l) => l[i])));
    return {key: k, vals: own, seoul, gap: seoul ? mean(own) / mean(seoul) - 1 : NaN};
  // (again when Overlay rebuilds the daily tables with the years it loaded)
  }).filter((r): r is NonNullable<typeof r> => !!r), [keys.join(), level, code, from, to, loads,
    datasets?.dong_daily?.dataContainer, datasets?.gu_daily?.dataContainer]);   // eslint-disable-line react-hooks/exhaustive-deps

  const own = rows.find((r) => r.key === key);
  const smallYears = useMemo(() => (
    <>
      {rows.map((r, k) => (
        <Year key={r.key} W={W} vals={r.vals} hot={flags.hot} mild={flags.mild} y0={k * (SMALL + GAP)} h={SMALL} name={nameOf(r.key)}
          marked={r.key === key} seoul={r.seoul ?? undefined}
          note={Number.isFinite(r.gap) ? {text: `${pct(r.gap)} vs Seoul`, cls: tone(r.gap)} : undefined} />
      ))}
      <DateAxis W={W} from={from} n={n} y={rows.length * (SMALL + GAP) + 6} />
    </>
  ), [rows, flags, key, W, from, n]);
  const bigYear = useMemo(() => own && (
    <Year W={W} vals={own.vals} hot={flags.hot} mild={flags.mild} y0={0} h={BIG - 16} name={`${nameOf(key)} · ${placeName}`} big
      seoul={own.seoul ?? undefined} axis="" />
  ), [own, flags, key, placeName, W]);

  if (!v) return null;
  if (!own) return <p className="dash-empty">Loading {nameOf(key)}…</p>;
  const X = (i: number) => (i / Math.max(1, n - 1)) * W;
  const today = Math.round((day * DAY - from) / DAY);
  const dateOf = (i: number) => new Date(from + i * DAY).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: n > 370 ? 'numeric' : undefined, timeZone: 'UTC'});
  const busiest = own.vals.reduce((b, x, i) => (Number.isFinite(x) && (!Number.isFinite(own.vals[b]) || x > own.vals[b]) ? i : b), 0);
  const ownMean = mean(own.vals), seoulMean = own.seoul ? mean(own.seoul) : NaN;
  const onHot = mean(own.vals.filter((_, i) => flags.hot[i])), onMild = mean(own.vals.filter((_, i) => flags.mild[i]));
  const heat = Number.isFinite(onHot) && onMild > 0 ? onHot / onMild - 1 : NaN;
  // each year's mean, against the year before, when the period runs over more than one
  const years: {y: number; m: number; d: number}[] = [];
  for (let yr = new Date(from).getUTCFullYear(); yr <= new Date(to - 1).getUTCFullYear(); yr++) {
    const a = Math.max(0, Math.round((Date.UTC(yr, 0, 1) - from) / DAY)), b = Math.min(n, Math.round((Date.UTC(yr + 1, 0, 1) - from) / DAY));
    const m = mean(own.vals.slice(a, b));
    if (Number.isFinite(m)) years.push({y: yr, m, d: years.length ? m / years[years.length - 1].m - 1 : NaN});
  }
  const unit = v.unit === 'people' ? '' : ` ${v.unit}`;
  const smallH = rows.length * (SMALL + GAP) + 10;
  return (
    <div className="sales daily">
      <div className="sp-top">
        <div ref={measure}><svg viewBox={`0 0 ${W} ${BIG}`} width={W} height={BIG} className="sp-svg" role="img"
          aria-label={`${nameOf(key)} every day of the period, ${placeName}`}>
          {bigYear}
          {today >= 0 && today < n && <line className="sp-today" x1={X(today)} x2={X(today)} y1={0} y2={BIG - 16} />}
          <DateAxis W={W} from={from} n={n} y={BIG - 2} />
        </svg></div>
        <div className="sp-read">
          <div className="sp-big">{fmt(ownMean)}<span className="sp-big-unit">{unit} a day</span></div>
          <p>{nameOf(key)}, {placeName}, {dateOf(0)} – {dateOf(n - 1)}</p>
          {Number.isFinite(seoulMean) && <p>a typical Seoul {peersOf}: <b>{fmt(seoulMean)}</b> <b className={tone(ownMean / seoulMean - 1)}>({pct(ownMean / seoulMean - 1)})</b></p>}
          <p className="dim">busiest {fmt(own.vals[busiest])} on {dateOf(busiest)}</p>
          {Number.isFinite(heat) && <p>a heat day against a mild day: <b className={tone(heat)}>{pct(heat)}</b></p>}
        </div>
      </div>
      <div className="sp-sub">{rows.length > 1 ? 'Public daily data, here' : 'By year'}</div>
      <div className="sp-break">
        {rows.length > 1 ? <svg viewBox={`0 0 ${W} ${smallH}`} width={W} height={smallH} className="sp-svg">{smallYears}</svg> : <div />}
        <div className="sp-words">
          {years.length > 1 ? <>
            <p className="dim">Each year's daily mean, here…</p>
            {years.map((x) => <p key={x.y}>{x.y} <b>{fmt(x.m)}</b>{Number.isFinite(x.d) && <b className={tone(x.d)}> {pct(x.d)}</b>}</p>)}
          </> : <p className="dim">Widen the time ruler's period past a year to compare years{v.years ? ` (${v.years[0]}–${v.years[1]})` : ''}.</p>}
          {keys.length > rows.length && <p className="dim">{keys.length - rows.length} more of the theme have no days in this period.</p>}
        </div>
      </div>
      <div className="shap-legend">
        <span>line: daily, bold 7-day mean</span>
        {level !== 'seoul' && <span><i className="sp-dash seoul" />Seoul's median {peersOf}, 7-day mean</span>}
        {flags.hot.some(Boolean) && <span><i className="sp-key heat" />heat day (feels-like ≥ 33 °C, 2024)</span>}
        {level !== 'seoul' && <span>right of each row: the period's mean against Seoul</span>}
        <span>the period is the time ruler's</span>
      </div>
    </div>
  );
}
