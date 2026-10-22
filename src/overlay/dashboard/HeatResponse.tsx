import {useMemo, useState} from 'react';
import {SALES_GROUP_KEYS, VAR_BY_KEY} from '../../data/catalog';
import {fmt, focusValue, seriesByDay} from '../focusValues';
import {scaleOf} from '../scatter';
import type {DashCtx} from './Dashboard';

const DAY = 86400000;
const HOT = 33;                      // KMA heat day: apparent max ≥ 33 °C
const MILD: [number, number] = [18, 26];   // mild day: apparent max 18–26 °C, dry, not a holiday
const W = 520, H = 250, PAD = {l: 6, r: 6, t: 14, b: 18};

// The heat response — the RHSI behind a picture. Every day of the year for the focused
// place: apparent max temperature across, sales up. Heat days (≥ 33 °C) red, mild days
// (18–26 °C, no rain, not a holiday) blue; their mean sales are the two dashed lines, and
// the log of their ratio is the RHSI read off this one place's year. Days are classed by
// the source's own is_hot / is_mild flags (a district or Seoul: most of its dongs), so for
// a dong it is the study's RHSI exactly — re-deriving them from rounded temperatures moved
// days across the 33 °C line.
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
    const t = seriesByDay(dataset, 'apptemp_max', key, code, 'mean');
    const s = seriesByDay(dataset, salesKey, key, code, 'sum');
    const p = seriesByDay(dataset, 'precip_sum', key, code, 'mean');
    const fh = seriesByDay(dataset, 'is_hot', key, code, 'mean'), fm = seriesByDay(dataset, 'is_mild', key, code, 'mean');
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
    return {days, hot, mild, sx, sy, start: t.start, rhsi: hot && mild && hot.v > 0 && mild.v > 0 ? Math.log(hot.v / mild.v) : null};
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
  const {days, hot, mild, sx, sy, rhsi} = model;
  const todayIdx = Math.round((day * DAY - model.start) / DAY);
  const today = days.find((d) => d.i === todayIdx);
  const shown = days.find((d) => d.i === (hover ?? todayIdx));
  return (
    <>
      <svg className="gc-plot" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`${sales.short} against apparent max temperature, one dot per day, ${placeName}`}
        onMouseLeave={() => setHover(null)}>
        {/* the mild band and the heat line */}
        <rect className="hr-mild" x={sx.px(MILD[0])} width={Math.max(0, sx.px(MILD[1]) - sx.px(MILD[0]))} y={PAD.t} height={H - PAD.t - PAD.b} />
        <line className="hr-hot" x1={sx.px(HOT)} x2={sx.px(HOT)} y1={PAD.t} y2={H - PAD.b} />
        <text className="gc-tick" x={sx.px(HOT) + 3} y={PAD.t + 8}>33 °C</text>
        {mild && <line className="hr-mean mild" x1={PAD.l} x2={W - PAD.r} y1={sy.px(mild.v)} y2={sy.px(mild.v)} />}
        {hot && <line className="hr-mean hot" x1={PAD.l} x2={W - PAD.r} y1={sy.px(hot.v)} y2={sy.px(hot.v)} />}
        {dots}
        {today && <circle className={`hr-day ${today.kind} today`} r={4.5} cx={sx.px(today.temp)} cy={sy.px(today.sales)} />}
        <text className="gc-axis" x={W - PAD.r} y={H - 1} textAnchor="end">Apparent max temp (°C) →</text>
        <text className="gc-axis" x={PAD.l} y={1} dominantBaseline="hanging">↑ {sales.short}</text>
      </svg>
      <div className="gc-caption">
        {shown && <span className="gc-name">{shown.date}</span>}
        {shown && <span>{shown.temp.toFixed(1)} °C</span>}
        {shown && <span>{fmt(shown.sales)} KRW</span>}
        <span className="gc-rank" title={`log(mean sales on ${hot?.n ?? 0} heat days ÷ mean on ${mild?.n ?? 0} mild days)`}>
          RHSI ≈ {rhsi == null ? '—' : rhsi.toFixed(2)}{studyRhsi != null ? ` · study ${studyRhsi.toFixed(2)}` : ''}
        </span>
      </div>
    </>
  );
}
