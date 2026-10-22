import {useMemo} from 'react';
import {VAR_BY_KEY, isTemporal, type Variable} from '../../data/catalog';
import type {Place} from '../../data/uhus';
import {fmt} from '../focusValues';
import {placeSeries} from '../scatter';
import {ourFiltersKey} from '../ourFilters';
import type {DashCtx} from './Dashboard';

const DAY = 86400000;
const RHSI = VAR_BY_KEY.RHSI_retail;
const HEAT_DAYS = VAR_BY_KEY.n_hot_days;

// The dashboard's first glance: a row of big numbers for the focused place — each linked
// variable against the average place of its kind and its rank among them, its heat
// sensitivity (the study's RHSI) and its heat days — and one sentence that says it in
// words. A place is compared with its peers: a neighbourhood with the 422 neighbourhoods,
// a district with the 25 districts. Seoul has no peers, so it shows the spread instead.
export default function Summary({ctx}: {ctx: DashCtx}) {
  const {data, focus, vars, datasets, filters, day, grain} = ctx;
  const level: 'dong' | 'gu' = focus.level === 'seoul' ? grain : focus.level;
  const places: Place[] = level === 'dong' ? data.dongs : data.gus;
  const code = focus.level === 'seoul' ? null : focus.level === 'dong' ? focus.dong.code : focus.gu.code;
  const placeName = focus.level === 'seoul' ? 'Seoul' : focus.level === 'dong' ? focus.dong.name : focus.gu.name;
  const peerNoun = level === 'dong' ? 'neighbourhood' : 'district';

  // the tiles: the linked variables, then heat sensitivity and heat days — four at most
  const tileVars = useMemo(() => {
    const out = [...vars];
    for (const x of [RHSI, HEAT_DAYS]) if (x && !out.some((y) => y.key === x.key)) out.push(x);
    return out.slice(0, 4);
  }, [vars]);
  // every peer's value; the memo watches the day and the datasets present, not kepler's
  // per-step dataset objects (see Dashboard)
  const datasetKeys = Object.keys(datasets || {}).join();
  const series = useMemo(() => placeSeries(datasets, tileVars, level, filters),
    [tileVars, level, datasetKeys, day, ourFiltersKey(filters)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => tileVars.map((x, i) => statsOf(series[i], code)), [series, code]);   // eslint-disable-line react-hooks/exhaustive-deps

  const date = new Date(day * DAY);
  const dayLabel = date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'});
  const nameOf = (c: string | undefined) => places.find((p) => p.code === c)?.name ?? '—';

  const story = storyOf({placeName, peerNoun, code, tileVars, linkedKeys: vars.map((x) => x.key), stats, dayLabel, nameOf});

  return (
    <div className="dash-summary">
      <div className="dash-kpis">
        {tileVars.map((x, i) => {
          const s = stats[i];
          if (!s) return null;
          const isRhsi = x.key === RHSI?.key;
          return (
            <div key={x.key} className="kpi">
              <div className="kpi-label">{isRhsi ? 'Heat sensitivity' : stripDaily(x.short)}
                {isTemporal(x) && <span> · {dayLabel}</span>}</div>
              <div className="kpi-value">{fmt(code ? s.value : s.overall(x))}
                {x.unit !== 'ratio' && x.unit !== 'log-ratio' && <small> {x.unit}</small>}</div>
              {isRhsi && s.value != null && code ? (
                <div className="kpi-sub"><Delta d={(Math.exp(s.value) - 1) * 100} pct />
                  <span> sales on hot days</span></div>
              ) : code && s.value != null ? (
                <div className="kpi-sub"><Delta d={s.delta(x)} pct={!x.signed && s.mean !== 0} />
                  <span> vs avg {peerNoun}</span></div>
              ) : (
                <div className="kpi-sub">range {fmt(s.min)} – {fmt(s.max)}</div>
              )}
              {code && s.rank != null && (
                <div className="kpi-rank">{isRhsi
                  ? <>#{s.n - s.rank + 1} most sensitive of {s.n}</>
                  : <>#{s.rank} of {s.n} · top {Math.max(1, Math.round((s.rank / s.n) * 100))}%</>}</div>
              )}
            </div>
          );
        })}
      </div>
      {story && <p className="dash-story">{story}</p>}
    </div>
  );
}

type Stats = NonNullable<ReturnType<typeof statsOf>>;
// One variable across the peers: the focused place's value, the average, the range, and
// where the place ranks (1 = highest).
function statsOf(values: Map<string, number> | undefined, code: string | null) {
  if (!values?.size) return null;
  const sorted = [...values.entries()].sort((a, b) => b[1] - a[1]);
  const all = sorted.map(([, v]) => v);
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const value = code ? values.get(code) ?? null : null;
  const at = code ? sorted.findIndex(([c]) => c === code) : -1;
  return {
    value, mean, n: all.length, min: all[all.length - 1], max: all[0],
    median: all[Math.floor(all.length / 2)],
    rank: at >= 0 ? at + 1 : null,
    top: sorted[0]?.[0], bottom: sorted[sorted.length - 1]?.[0],
    // a percentage of the average, or a plain difference for signed values (an average
    // near zero turns a percentage meaningless)
    delta: (x: Variable) => value == null ? 0 : !x.signed && mean !== 0 ? ((value - mean) / Math.abs(mean)) * 100 : value - mean,
    // Seoul as a whole: totals add up, rates average
    overall: (x: Variable) => x.how === 'sum' ? all.reduce((a, b) => a + b, 0) : mean,
  };
}

// Above the average warm, below it cool — the map's blue-red, not good and bad.
function Delta({d, pct}: {d: number; pct: boolean}) {
  const up = d > 0;
  const cls = Math.abs(d) < (pct ? 0.5 : 1e-3) ? 'flat' : up ? 'up' : 'down';
  return <span className={`kpi-delta ${cls}`}>{up ? '▲' : d < 0 ? '▼' : '■'} {pct ? `${Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0)}%` : fmt(Math.abs(d))}</span>;
}

const stripDaily = (s: string) => s.replace(/\s*\(daily\)/, '');

// Where a share of the way down a ranking falls, in words.
function band(share: number, most: string, least: string) {
  if (share <= 0.1) return `among the 10% ${most}`;
  if (share <= 0.25) return `among the 25% ${most}`;
  if (share > 0.9) return `among the 10% ${least}`;
  if (share > 0.75) return `among the 25% ${least}`;
  return 'near the middle';
}

type StoryArgs = {placeName: string; peerNoun: string; code: string | null; tileVars: Variable[]; linkedKeys: string[]; stats: (Stats | null)[];
  dayLabel: string; nameOf: (c: string | undefined) => string};
// One sentence (two at most) from the same numbers as the tiles.
function storyOf({placeName, peerNoun, code, tileVars, linkedKeys, stats, dayLabel, nameOf}: StoryArgs): string | null {
  const ri = tileVars.findIndex((x) => x.key === RHSI?.key);
  const r = ri >= 0 ? stats[ri] : null;
  // the first linked variable that is not RHSI itself (that one has its own sentence)
  const ai = tileVars.findIndex((x) => x.key !== RHSI?.key && linkedKeys.includes(x.key));
  const a = ai >= 0 ? tileVars[ai] : undefined, sa = ai >= 0 ? stats[ai] : null;
  const lowerHigher = (rhsi: number) => {
    const p = (Math.exp(rhsi) - 1) * 100;
    return `${Math.abs(p).toFixed(0)}% ${p < 0 ? 'lower' : 'higher'}`;
  };
  const parts: string[] = [];
  if (code) {
    if (r?.value != null && r.rank != null) {
      const share = (r.n - r.rank + 1) / r.n;   // 0 = most sensitive (lowest RHSI)
      parts.push(`${placeName}: retail sales are ${lowerHigher(r.value)} on hot days than on mild days — ` +
        `${band(share, `most heat-sensitive ${peerNoun}s`, `least heat-sensitive ${peerNoun}s`)} in Seoul.`);
    }
    if (a && a.key !== RHSI?.key && sa?.value != null && sa.rank != null) {
      const d = sa.delta(a);
      const when = isTemporal(a) ? ` on ${dayLabel}` : '';
      const size = !a.signed && sa.mean !== 0 ? `${Math.abs(d).toFixed(0)}% ${d >= 0 ? 'above' : 'below'}` : `${fmt(Math.abs(d))} ${d >= 0 ? 'above' : 'below'}`;
      parts.push(`${stripDaily(a.short)}${when} is ${size} the average ${peerNoun} (#${sa.rank} of ${sa.n}).`);
    }
  } else {
    if (r) {
      parts.push(`Across Seoul, the median ${peerNoun}'s retail sales are ${lowerHigher(r.median)} on hot days than on mild days; ` +
        `the most heat-sensitive is ${nameOf(r.bottom)}.`);
    }
    if (a && a.key !== RHSI?.key && sa) {
      const when = isTemporal(a) ? ` on ${dayLabel}` : '';
      parts.push(`${stripDaily(a.short)}${when} is highest in ${nameOf(sa.top)} and lowest in ${nameOf(sa.bottom)}.`);
    }
  }
  return parts.length ? parts.join(' ') : null;
}
