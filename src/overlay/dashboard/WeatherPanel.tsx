import {useMemo} from 'react';
import {VAR_BY_KEY} from '../../data/catalog';
import {STUDY_YEAR, numericColumn, seriesByDay, yearOfDays} from '../focusValues';
import {placeSeries} from '../scatter';
import {Months, Year, mean, median, nameOf, useColumnWidth} from './SalesPanel';
import type {DashCtx} from './Dashboard';

// Weather — the year, and the heat. When daily weather leads the selection, the wide panel
// is the Sales panel's frame for it: the selected variable's year for the focused place,
// large, heat days shaded as in the Sales panel and Seoul's typical neighbourhood dashed under
// it, with the place's heat days beside it (against Seoul's, and its rank); under it all four
// daily weather variables, a small year each, ending in how far the place sits from Seoul
// over the year, and at the right, each of them on the place's heat days.
// Mockup: mockups/wide-panel-options.html (A′).
const DAY = 86400000;
const BIG = 190, SMALL = 44, GAP = 6;
export const WEATHER_KEYS = ['temp_max', 'apptemp_max', 'humid_max', 'precip_sum'];
export const isWeatherKey = (key: string) => WEATHER_KEYS.includes(key);

const unitOf = (key: string) => (VAR_BY_KEY[key]?.unit === '%' ? '%' : ` ${VAR_BY_KEY[key]?.unit ?? ''}`);
const num = (key: string, v: number) => (Number.isFinite(v) ? v.toFixed(key === 'humid_max' ? 0 : 1) : '—');

// each day's median over every row of that day: Seoul's typical neighbourhood (or district)
function medianByDay(dataset: any, field: string) {
  const f = dataset?.fields.find((x: any) => x.name === field), d = dataset?.fields.find((x: any) => x.name === 'date');
  if (!f || !d) return null;
  const v = numericColumn(dataset, f), t = numericColumn(dataset, d);
  const [lo, hi] = STUDY_YEAR;
  const days: number[][] = [];
  for (let r = 0; r < v.length; r++) if (Number.isFinite(v[r]) && t[r] >= lo && t[r] < hi) (days[Math.round((t[r] - lo) / DAY)] ??= []).push(v[r]);
  return Array.from(days, (xs) => (xs?.length ? median(xs) : NaN));
}

export default function WeatherPanel({ctx, weatherKey: key}: {ctx: DashCtx; weatherKey: string}) {
  const {focus, grain, datasets, day} = ctx;
  const [W, measure] = useColumnWidth();

  // the focused place, read where its rows are: its own dong where loaded, else its district
  const byDong = focus.level === 'dong' && grain === 'dong' && !!datasets?.dong_daily;
  const table = byDong ? datasets.dong_daily : datasets?.gu_daily;
  const level: 'seoul' | 'gu' | 'dong' = focus.level === 'seoul' ? 'seoul' : byDong ? 'dong' : 'gu';
  const keyField = level === 'seoul' ? null : level === 'dong' ? 'dong_code' : 'gu_code';
  const code = level === 'seoul' ? null : level === 'dong' ? (focus as any).dong.code : (focus as any).gu.code;
  const placeName = level === 'seoul' ? 'Seoul' : level === 'dong' ? (focus as any).dong.name : (focus as any).gu.name;
  // Seoul, day by day: the median neighbourhood where the neighbourhoods are loaded, else district
  const ref = datasets?.dong_daily ?? datasets?.gu_daily;
  const refOf = datasets?.dong_daily ? 'neighborhood' : 'district';
  const seoul = useMemo(() => Object.fromEntries(WEATHER_KEYS.map((k) => [k, medianByDay(ref, k)])),
    [ref?.dataContainer]);   // eslint-disable-line react-hooks/exhaustive-deps

  const model = useMemo(() => {
    if (!table) return null;
    const hs = seriesByDay(table, 'is_hot', keyField, code, 'mean', STUDY_YEAR), ms = seriesByDay(table, 'is_mild', keyField, code, 'mean', STUDY_YEAR);
    if (!hs || !ms) return null;
    const hot = hs.vals.map((v) => v >= 0.5), mild = ms.vals.map((v) => v >= 0.5);
    const onHot = (v: number[]) => mean(v.filter((_, i) => hot[i]));
    const rows = WEATHER_KEYS.map((k) => {
      const vals = seriesByDay(table, k, keyField, code, 'mean', STUDY_YEAR)?.vals;
      if (!vals) return null;
      const s = seoul[k];
      return {key: k, vals, seoul: s, gap: s ? mean(vals.map((v, i) => v - s[i])) : NaN, hot: onHot(vals), seoulHot: s ? onHot(s) : NaN};
    }).filter((r): r is NonNullable<typeof r> => !!r);
    return {start: hs.start, hot, mild, rows};
  }, [table?.dataContainer, keyField, code, seoul]);   // eslint-disable-line react-hooks/exhaustive-deps

  // heat days per place at the map's grain, for Seoul's typical count and the place's rank
  const datasetKeys = Object.keys(datasets || {}).join();
  const heatDays = useMemo(() => placeSeries(datasets, [VAR_BY_KEY.n_hot_days], grain, [])[0],
    [datasetKeys, grain]);   // eslint-disable-line react-hooks/exhaustive-deps

  const own = model?.rows.find((r) => r.key === key);
  const vsSeoul = level !== 'seoul';
  const smallYears = useMemo(() => model && (
    <>
      {model.rows.map((r, k) => (
        <Year key={r.key} W={W} vals={r.vals} hot={model.hot} mild={model.mild} y0={k * (SMALL + GAP)} h={SMALL}
          name={nameOf(r.key)} marked={r.key === key} bars={r.key === 'precip_sum'} seoul={vsSeoul ? r.seoul ?? undefined : undefined}
          note={vsSeoul && Number.isFinite(r.gap) ? {text: `${r.gap >= 0 ? '+' : '−'}${num(r.key, Math.abs(r.gap))}${unitOf(r.key)} vs Seoul`,
            cls: Math.abs(r.gap) < 0.05 ? '' : r.gap > 0 ? 'rose' : 'fell'} : undefined} />
      ))}
      <Months W={W} y={model.rows.length * (SMALL + GAP) + 6} />
    </>
  ), [model, key, W, vsSeoul]);
  const bigYear = useMemo(() => model && own && (
    <Year W={W} vals={own.vals} hot={model.hot} mild={model.mild} y0={0} h={BIG - 16} name={`${nameOf(key)} · ${placeName}`} big
      bars={key === 'precip_sum'} seoul={vsSeoul ? own.seoul ?? undefined : undefined} axis={unitOf(key)} />
  ), [model, own, key, placeName, W, vsSeoul]);

  if (!model) return <p className="dash-empty">Loading the daily values…</p>;
  if (!own) return <p className="dash-empty">Loading {nameOf(key)}…</p>;
  const today = Math.round((day * DAY - model.start) / DAY);
  const X = (i: number) => (i / (own.vals.length - 1)) * W;
  const nHot = model.hot.filter(Boolean).length;
  const all = heatDays ? [...heatDays.values()] : [], mine = code ? heatDays?.get(code) : undefined;
  const rank = mine != null ? all.filter((v) => v > mine).length + 1 : null;
  const dateOf = (i: number) => new Date(model.start + i * DAY).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'});
  const temp = model.rows.find((r) => r.key === 'temp_max');
  const hottest = temp ? temp.vals.reduce((b, v, i) => (Number.isFinite(v) && !(v <= temp.vals[b]) ? i : b), 0) : -1;
  const year = yearOfDays(model.start, own.vals.length);
  let run = 0, longest = [0, 0];
  model.hot.forEach((b, i) => { run = b ? run + 1 : 0; if (run > longest[0]) longest = [run, i]; });
  const smallH = model.rows.length * (SMALL + GAP) + 10;
  return (
    <div className="sales weather">
      <div className="sp-top">
        <div ref={measure}><svg viewBox={`0 0 ${W} ${BIG}`} width={W} height={BIG} className="sp-svg" role="img"
          aria-label={`${nameOf(key)} every day${year ? ` of ${year}` : ''}, ${placeName}, heat days shaded`}>
          {bigYear}
          {today >= 0 && today < own.vals.length && <line className="sp-today" x1={X(today)} x2={X(today)} y1={0} y2={BIG - 16} />}
          <Months W={W} y={BIG - 2} />
        </svg></div>
        <div className="sp-read">
          <div className="sp-big">{nHot}<span className="sp-big-unit"> heat days</span></div>
          <p>{year ? `in ${year}, ` : ''}{level === 'seoul' ? 'Seoul — days when most of it was hot' : placeName}</p>
          {all.length > 0 && <p>a typical Seoul {grain === 'dong' ? 'neighborhood' : 'district'}: <b>{Math.round(median(all))}</b></p>}
          {rank != null && <p>#{rank} of {all.length} for heat days</p>}
          {temp && hottest >= 0 && (
            <p className="dim">hottest {num('temp_max', temp.vals[hottest])} °C on {dateOf(hottest)}
              {longest[0] > 1 ? ` · longest run ${longest[0]} days, to ${dateOf(longest[1])}` : ''}</p>
          )}
        </div>
      </div>
      <div className="sp-sub">Daily weather, {level === 'seoul' ? 'Seoul' : 'here'}</div>
      <div className="sp-break">
        <svg viewBox={`0 0 ${W} ${smallH}`} width={W} height={smallH} className="sp-svg">{smallYears}</svg>
        <div className="sp-words">
          <p className="dim">On heat days, {level === 'seoul' ? 'Seoul' : 'here'}…</p>
          {model.rows.map((r) => (
            <p key={r.key}>{nameOf(r.key)} <b>{num(r.key, r.hot)}{unitOf(r.key)}</b>
              {vsSeoul && Number.isFinite(r.seoulHot) && <span className="dim"> · Seoul {num(r.key, r.seoulHot)}</span>}</p>
          ))}
          <p className="dim">A heat day: apparent max ≥ 33 °C. The same days shade the Sales panel.</p>
        </div>
      </div>
      <div className="shap-legend">
        <span><i className="sp-key heat" />heat day (feels-like ≥ 33 °C)</span>
        <span><i className="sp-key mild" />mild day</span>
        <span>line: daily, bold 7-day mean</span>
        {vsSeoul && <span><i className="sp-dash seoul" />Seoul's median {refOf}, 7-day mean</span>}
        {vsSeoul && <span>right of each row: the year's mean against Seoul</span>}
      </div>
    </div>
  );
}
