import {useMemo, useState} from 'react';
import {SALES_GROUP_KEYS, VAR_BY_KEY} from '../../data/catalog';
import {STUDY_YEAR, fmt, focusValue, seriesByDay} from '../focusValues';
import {niceTicks, scaleOf} from '../scatter';
import type {DashCtx} from './Dashboard';

const DAY = 86400000;
const HOT = 33;                      // KMA heat day: apparent max ≥ 33 °C
const MILD: [number, number] = [18, 26];   // mild day: apparent max 18–26 °C, dry, not a holiday
const W = 560, H = 290, PAD = {l: 44, r: 104, t: 18, b: 26};
const BAND = 5;                      // the white line: the mean sales of each 5 °C band of days
const won = (v: number) => `₩${Math.round(v / 1e6).toLocaleString('en-US')}M`;

// The heat response — the RHSI behind a picture. Every day of the year for the focused
// place: apparent max temperature across, sales up. Heat days (≥ 33 °C) red, mild days
// (18–26 °C, no rain, not a holiday) blue; their mean sales are the two dashed lines, and
// the log of their ratio is the RHSI read off this one place's year. Days are classed by
// the source's own is_hot / is_mild flags (a district or Seoul: most of its dongs), so for
// a dong it is the study's RHSI exactly — re-deriving them from rounded temperatures moved
// days across the 33 °C line. Over the days: numbers on both axes, the two means named with
// their gap, and the mean of each 5 °C band as a white line — how sales move as days warm.
export default function HeatResponse({ctx}: {ctx: DashCtx}) {
  const {data, focus, grain, datasets, selection, day} = ctx;
  const [hover, setHover] = useState<number | null>(null);
  // sales: the daily sales variable linked, else retail (what RHSI is defined on)
  const salesKey = selection.find((k) => k === 'retail_total_amount' || SALES_GROUP_KEYS.includes(k)) ?? 'retail_total_amount';
  const sales = VAR_BY_KEY[salesKey];

  // the focused place's rows: its own dong where loaded, else its district, else all Seoul
  const byDong = focus.level === 'dong' && grain === 'dong' && !!datasets?.dong_daily;
  const dataset = byDong ? datasets.dong_daily : datasets?.gu_daily;
  const key = focus.level === 'seoul' ? null : byDong ? 'dong_code' : 'gu_code';
  const code = focus.level === 'seoul' ? null : byDong ? (focus as any).dong.code : focus.gu.code;
  const placeName = focus.level === 'seoul' ? 'Seoul' : byDong ? (focus as any).dong.name : focus.gu.name;

  const model = useMemo(() => {
    const t = seriesByDay(dataset, 'apptemp_max', key, code, 'mean', STUDY_YEAR);
    const s = seriesByDay(dataset, salesKey, key, code, 'sum', STUDY_YEAR);
    const p = seriesByDay(dataset, 'precip_sum', key, code, 'mean', STUDY_YEAR);
    const fh = seriesByDay(dataset, 'is_hot', key, code, 'mean', STUDY_YEAR), fm = seriesByDay(dataset, 'is_mild', key, code, 'mean', STUDY_YEAR);
    if (!t || !s || !p) return null;
    const days = t.vals.map((x, i) => {
      const date = new Date(t.start + i * DAY).toISOString().slice(0, 10);
      const kind = fh && fm ? (fh.vals[i] >= 0.5 ? 'hot' : fm.vals[i] >= 0.5 ? 'mild' : 'other')
        : x >= HOT ? 'hot' : x >= MILD[0] && x <= MILD[1] && p.vals[i] === 0 && !data.holidays.has(date) ? 'mild' : 'other';
      return {i, temp: x, sales: s.vals[i], kind, date};
    }).filter((d) => Number.isFinite(d.temp) && Number.isFinite(d.sales));
    const mean = (k: string) => {
      const xs = days.filter((d) => d.kind === k).map((d) => d.sales);
      return xs.length ? {v: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length} : null;
    };
    const hot = mean('hot'), mild = mean('mild');
    const sx = scaleOf(days.map((d) => d.temp), PAD.l + 8, W - PAD.r - 8);
    const sy = scaleOf(days.map((d) => d.sales), H - PAD.b - 6, PAD.t + 6);
    const bands: {t: number; v: number; n: number}[] = [];
    for (let b = Math.floor(sx.lo / BAND) * BAND; b < sx.hi; b += BAND) {
      const xs = days.filter((d) => d.temp >= b && d.temp < b + BAND).map((d) => d.sales);
      if (xs.length >= 5) bands.push({t: b, v: xs.reduce((p, q) => p + q, 0) / xs.length, n: xs.length});
    }
    return {days, hot, mild, sx, sy, bands, start: t.start, rhsi: hot && mild && hot.v > 0 && mild.v > 0 ? Math.log(hot.v / mild.v) : null};
  // keyed on the rows themselves (dataContainer), not the dataset object kepler replaces on
  // every filter step — rebuilding the year each playback step was what dragged it
  }, [dataset?.dataContainer, key, code, salesKey, data.holidays]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the study's own RHSI for this place (retail only), to set beside the one read here
  const studyRhsi = salesKey === 'retail_total_amount' && focus.level !== 'seoul'
    ? focusValue(datasets?.[grain === 'dong' && focus.level === 'dong' ? 'dong' : 'gu'], 'RHSI_retail', focus, 'mean') : null;

  // the 366 dots depend on the place only; the day just moves the ring over one of them
  const dots = useMemo(() => model && model.days.map((d) => (
    <circle key={d.i} className={`hr-day ${d.kind}`} r={2.6} cx={model.sx.px(d.temp)} cy={model.sy.px(d.sales)}
      onMouseEnter={() => setHover(d.i)} />
  )), [model]);
  if (!model) return <p className="dash-empty">Loading the daily values…</p>;
  const {days, hot, mild, sx, sy, bands, rhsi} = model;
  const lx = W - PAD.r;
  const todayIdx = Math.round((day * DAY - model.start) / DAY);
  const today = days.find((d) => d.i === todayIdx);
  const shown = days.find((d) => d.i === (hover ?? todayIdx));
  return (
    <>
      <svg className="gc-plot" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`${sales.short} against apparent max temperature, one dot per day, ${placeName}`}
        onMouseLeave={() => setHover(null)}>
        <g className="gc-ticks">
          {niceTicks(sy.lo, sy.hi, sy.sqrt, 4).map((t) => <g key={`y${t}`}><line x1={PAD.l} x2={lx} y1={sy.px(t)} y2={sy.px(t)} />
            <text className="gc-tick" x={PAD.l - 4} y={sy.px(t) + 3} textAnchor="end">{won(t)}</text></g>)}
          {niceTicks(sx.lo, sx.hi, false, 5).map((t) => <g key={`x${t}`}><line x1={sx.px(t)} x2={sx.px(t)} y1={PAD.t} y2={H - PAD.b} />
            <text className="gc-tick" x={sx.px(t)} y={H - PAD.b + 11} textAnchor="middle">{t} °C</text></g>)}
        </g>
        {/* the mild band and the heat line */}
        <rect className="hr-mild" x={sx.px(MILD[0])} width={Math.max(0, sx.px(MILD[1]) - sx.px(MILD[0]))} y={PAD.t} height={H - PAD.t - PAD.b} />
        <text className="gc-tick hr-mild-label" x={(sx.px(MILD[0]) + sx.px(MILD[1])) / 2} y={PAD.t + 9} textAnchor="middle">mild {MILD[0]}–{MILD[1]} °C</text>
        <line className="hr-hot" x1={sx.px(HOT)} x2={sx.px(HOT)} y1={PAD.t} y2={H - PAD.b} />
        <text className="gc-tick hr-hot-label" x={sx.px(HOT) + 3} y={PAD.t + 9}>{HOT} °C</text>
        {dots}
        <polyline className="hr-band" points={bands.map((b) => `${sx.px(b.t + BAND / 2)},${sy.px(b.v)}`).join(' ')} />
        {bands.map((b) => <circle key={b.t} className="hr-band-dot" r={3.4} cx={sx.px(b.t + BAND / 2)} cy={sy.px(b.v)}>
          <title>{`${b.t}–${b.t + BAND} °C · ${b.n} days · mean ${won(b.v)}`}</title></circle>)}
        {today && <circle className={`hr-day ${today.kind} today`} r={4.5} cx={sx.px(today.temp)} cy={sy.px(today.sales)} />}
        {/* the two means, named, and the gap between them — the RHSI */}
        {mild && <line className="hr-mean mild" x1={PAD.l} x2={lx} y1={sy.px(mild.v)} y2={sy.px(mild.v)} />}
        {hot && <line className="hr-mean hot" x1={PAD.l} x2={lx} y1={sy.px(hot.v)} y2={sy.px(hot.v)} />}
        {mild && <><text className="hr-mean-name mild" x={lx + 8} y={sy.px(mild.v) - 3}>Mild-day mean</text>
          <text className="hr-mean-val" x={lx + 8} y={sy.px(mild.v) + 10}>{won(mild.v)}</text></>}
        {hot && <><text className="hr-mean-name hot" x={lx + 8} y={sy.px(hot.v) + (mild && hot.v < mild.v ? 13 : -16)}>Heat-day mean</text>
          <text className="hr-mean-val" x={lx + 8} y={sy.px(hot.v) + (mild && hot.v < mild.v ? 26 : -3)}>{won(hot.v)}</text></>}
        {hot && mild && rhsi != null && (
          <g className="hr-gap">
            <line x1={lx + 86} x2={lx + 86} y1={sy.px(mild.v)} y2={sy.px(hot.v)} />
            <text className="hr-gap-pct" x={lx + 92} y={(sy.px(mild.v) + sy.px(hot.v)) / 2 - 1}>{(Math.exp(rhsi) - 1) * 100 > 0 ? '+' : '−'}{Math.abs((Math.exp(rhsi) - 1) * 100).toFixed(0)}%</text>
          </g>
        )}
        <text className="gc-axis" x={lx} y={H - 1} textAnchor="end">Apparent max temp (°C) →</text>
        <text className="gc-axis" x={PAD.l} y={1} dominantBaseline="hanging">↑ {sales.short.replace(/\s*\(daily\)/, '')} per day (KRW)</text>
      </svg>
      <div className="gc-caption">
        {shown && <span className="gc-name">{shown.date}</span>}
        {shown && <span>{shown.temp.toFixed(1)} °C</span>}
        {shown && <span>{fmt(shown.sales)} KRW</span>}
        <span className="gc-rank" title={`log(mean sales on ${hot?.n ?? 0} heat days ÷ mean on ${mild?.n ?? 0} mild days)`}>
          RHSI ≈ {rhsi == null ? '—' : rhsi.toFixed(2)}{studyRhsi != null ? ` · study ${studyRhsi.toFixed(2)}` : ''}
        </span>
      </div>
      <div className="hr-key">
        <span><i className="dot hot" />Heat day (≥ {HOT} °C) · {hot?.n ?? 0}</span>
        <span><i className="dot mild" />Mild day ({MILD[0]}–{MILD[1]} °C, dry, workday) · {mild?.n ?? 0}</span>
        <span><i className="dot" />Other day</span>
        <span><i className="ln" />Mean by {BAND} °C band</span>
      </div>
    </>
  );
}
