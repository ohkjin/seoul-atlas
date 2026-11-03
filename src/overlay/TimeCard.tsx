import {useEffect, useMemo, useRef, useState} from 'react';
import {useDispatch, useStore} from 'react-redux';
import {setFilter, updateFilterAnimationSpeed} from '@kepler.gl/actions';
import type {Focus} from './Overlay';
import {useVisState} from './useKepler';
import {VAR_BY_KEY, colorRangeFor, isDivergingRamp, isTemporal} from '../data/catalog';
import {dataIdFor, type Grain} from './layers';
import {fmt, numericColumn, rowFilter} from './focusValues';
import {filtersKey} from './ourFilters';
import {BIVARIATE} from './pair';
import {Maximize2} from 'lucide-react';
import type {Period} from './TimeRuler';
import {COMBINE_LABEL, aggregateFor, canSum, combineFor, type Combine, type TimeView} from './timeModes';
import {aggIdOf} from '../data/catalog';
import {pointIdOf, pointsOf, sizeLegendOf} from './stations';
import type {ShowAs} from './timeModes';

const DAY = 86400000;
const SPEEDS = [0.5, 1, 2];
const DAYS_PER_SECOND = 10;   // at 1×: a year in ~37 s
const W = 288, H = 64;   // chart viewBox; the SVG scales to the card width
// the flat map's pair: the rose that A adds and the teal that B adds to its 3×3 grid (pair.ts)
const PAIR_COLOURS = [BIVARIATE[2][0], BIVARIATE[0][2]];
// a year's colour: one hue, or a ramp drawn up the chart (paint is then the gradient's url)
type Colour = {paint: string; ramp?: string[]};

// The time control: a full card at the foot of the right column, in the spirit of kepler's
// enlarged playback widget — a date, a chart over the time ruler's period of each daily variable selected (one,
// or two stacked) for the focused place, a playhead, and play / speed. With a value filter on (the atlas's or kepler's), the
// year is drawn twice, as kepler's own time chart does (every filter but time's): the place
// whole, grey, and its rows that pass the filters, in the accent — Actual on one scale (how
// much passes), or Scaled, the passing part on its own (how its year moves).
// Playback steps a whole day at a time. kepler's own player slides its window a little
// every frame, and each step refilters every row on the CPU — 154k rows once the per-dong
// daily data joined, ~13 ms a frame, which held playback near 30fps. The data is daily, so
// nothing new shows between midnights anyway: stepping by day costs that 10–20 times a
// second instead of 60, and the map keeps its frame rate in between.
// Two folder tabs stand on the card (mockups/time-modes/card.png): Timeline plays the period day by
// day, as above; Aggregate combines it into one value per place and the chart's space holds the
// choices instead. Under the chart, Value: Actual, or vs Avg — on the same day or over all days
// (timeModes.ts). A linked pair keeps its own day-by-day grid, so it has neither Aggregate nor Value.
type Props = {focus: Focus; selection: string[]; linked: boolean; is3d: boolean; grain: Grain; playing: boolean;
  period: Period;   // the time ruler's period: the chart spans it, playback loops inside it
  onPlaying: (on: boolean) => void;
  onExpand: () => void;
  view: TimeView; onView: (v: TimeView) => void; aggregateOn: boolean; paired: boolean;
  scopeName: string};   // whose average vs Avg is against: Seoul, or the focused district
const COMBINES: Combine[] = ['sum', 'mean', 'median', 'max', 'hotmild'];
const fmtDay = (t: number) => new Date(t).toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'});
export default function TimeCard({focus, selection, linked, is3d, grain, playing, period, onPlaying, onExpand,
  view, onView, aggregateOn, paired, scopeName}: Props) {
  const dispatch = useDispatch();
  const store = useStore<any>();
  const visState = useVisState();
  const filters = visState?.filters || [];
  const idx = filters.findIndex((f: any) => f.id === 'time');
  const f = filters[idx];
  // The daily variables selected, each read from the rows its grain draws (per-dong
  // sales load on demand; until then the district rows hold the same totals).
  const variables = selection.map((k) => VAR_BY_KEY[k]).filter((x) => x && isTemporal(x));
  const datasetOf = (x: (typeof variables)[number]) => visState?.datasets?.[dataIdFor(x, grain)] ?? visState?.datasets?.gu_daily;
  const filtersAt = filtersKey(filters);
  const focusKey = focus.level === 'seoul' ? 'seoul' : focus.level === 'gu' ? focus.gu.code : focus.dong.code;
  const [scaled, setScaled] = useState(false);
  // the days shown and played: the ruler's period, where the daily data has them
  const [lo, hi] = f?.domain ? [Math.max(period[0], f.domain[0]), Math.min(period[1] - DAY, f.domain[1])] : [0, -1];
  const span = useRef<[number, number]>([lo, hi]);
  span.current = [lo, hi];

  const all = useMemo(() => variables.map((variable) => {
    const dataset = datasetOf(variable);
    if (!dataset || !f?.domain || lo > hi) return null;
    // A neighbourhood is read from its own rows where the data has them, else from its
    // district's; Seoul and districts add up (sales) or average (temperature) their rows.
    const dongRows = dataset.fields.some((x: any) => x.name === 'dong_code');
    const byDong = focus.level === 'dong' && dongRows;
    const placeCode = focus.level === 'seoul' ? null : byDong ? (focus as any).dong.code : focus.gu.code;
    const areas = visState?.datasets?.[dongRows ? 'dong' : 'gu'];
    const dateField = dataset.fields.find((x: any) => x.name === 'date');
    const valueField = dataset.fields.find((x: any) => x.name === variable.key);
    const placeIdx = dataset.fields.findIndex((x: any) => x.name === (byDong ? 'dong_code' : 'gu_code'));
    if (!dateField || !valueField) return null;
    const t = numericColumn(dataset, dateField), v = numericColumn(dataset, valueField);
    const n = Math.round((hi - lo) / DAY) + 1;
    const sum = new Float64Array(n), cnt = new Uint32Array(n);
    const pass = rowFilter(dataset, areas, dongRows ? 'dong_code' : 'gu_code', filters);
    const ksum = new Float64Array(n), kcnt = new Uint32Array(n);
    for (let r = 0; r < t.length; r++) {
      if (placeCode && String(dataset.dataContainer.valueAt(r, placeIdx)) !== placeCode) continue;
      const d = Math.round((t[r] - lo) / DAY);
      if (d < 0 || d >= n || !Number.isFinite(v[r])) continue;
      sum[d] += v[r]; cnt[d]++;
      if (pass?.(r)) { ksum[d] += v[r]; kcnt[d]++; }
    }
    const total = variable.how === 'sum';
    // a day that nothing passes adds nothing to a total; a mean of nothing has no value
    const of = (s: Float64Array, c: Uint32Array) => Array.from(s, (x, i) => (c[i] ? (total ? x : x / c[i]) : total && cnt[i] ? 0 : NaN));
    const vals = of(sum, cnt);
    const finite = vals.filter(Number.isFinite);
    const kept = pass ? of(ksum, kcnt) : null;
    return {variable, vals, min: Math.min(...finite), max: Math.max(...finite), total, kept, places: cnt, passing: kcnt};
  }).filter((s): s is NonNullable<typeof s> => !!s),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [variables.map((x) => x.key).join(), focusKey, grain, lo, hi, visState?.datasets?.dong_daily, visState?.datasets?.gu_daily,
    visState?.datasets?.dong, visState?.datasets?.gu, filtersAt]);
  const series = all[0] ?? null;

  const speedNow = f?.speed ?? 1;
  useEffect(() => {
    if (!playing || idx < 0) return;
    const t = window.setInterval(() => {
      const cur = store.getState().keplerGl.map.visState.filters[idx];
      if (!cur?.value) return;
      const [lo, hi] = span.current;
      if (lo > hi) return;
      const day = Math.min(hi, Math.ceil(cur.value[0] / DAY) * DAY);
      const next = day + DAY > hi ? lo : day + DAY;   // loop back to the first day
      dispatch(setFilter(idx, 'value', [next, next + DAY - 1]) as any);
    }, 1000 / (DAYS_PER_SECOND * speedNow));
    return () => window.clearInterval(t);
  }, [playing, idx, speedNow]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPlaying(false), []);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!f?.domain || !Number.isFinite(f?.value?.[0])) return null;
  const day = Math.min(hi, Math.ceil(f.value[0] / DAY) * DAY);   // the one midnight in the window
  const progress = (day - lo) / Math.max(1, hi - lo);
  const speed = f.speed ?? 1;
  const at = Math.round((day - lo) / DAY);
  const pair = all.length > 1;
  type Series = (typeof all)[number];
  // Each year wears what its variable wears on the map now. A pair on the flat map is the 3×3
  // grid: A its rose, B its teal (the daily one of a daily × static pair too). In 3D, or side
  // by side, each has its own ramp: one hue from it, or for a blue-to-red one the ramp itself,
  // low to high up the chart. A variable alone keeps the accent.
  const colourOf = (s: Series): Colour | null => {
    if (selection.length < 2) return null;
    if (linked && !is3d) {
      const paint = PAIR_COLOURS[selection.indexOf(s.variable.key)];
      return paint ? {paint} : null;
    }
    const ramp = colorRangeFor(s.variable)?.colors ?? [];
    if (!ramp.length) return null;
    return isDivergingRamp(s.variable) ? {paint: `url(#tc-ramp-${s.variable.key})`, ramp} : {paint: ramp[4]};
  };
  const swatchOf = (c: Colour | null) => (c?.ramp ? `linear-gradient(90deg, ${c.ramp.join(', ')})` : c?.paint);

  // today's value: what passes the filters (with its share of a total) over the whole, or the whole
  const valueOf = (s: Series) => {
    const today = s.vals[at], kept = s.kept ? s.kept[at] : NaN;
    const unit = s.variable.unit !== 'ratio' ? ` ${s.variable.unit}` : '';
    return s.kept
      ? <span className="tc-now">{fmt(Number.isFinite(kept) ? kept : null)}{unit}
        {s.total && today > 0 && Number.isFinite(kept) && ` · ${Math.round((kept / today) * 100)}%`}
        <small>all {fmt(Number.isFinite(today) ? today : null)}{unit}</small></span>
      : <span className="tc-now">{fmt(Number.isFinite(today) ? today : null)}{unit}</span>;
  };

  const seek = (el: Element, clientX: number) => {
    const r = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const start = lo + Math.round((p * (hi - lo)) / DAY) * DAY;
    dispatch(setFilter(idx, 'value', [start, start + DAY - 1]) as any);
  };

  // a year as a path between lo and hi (the foot of the chart for a day without a value)
  const pathOf = (vals: number[], lo: number, hi: number) => {
    const span = hi - lo || 1;
    return `M${vals.map((val, i) => {
      const y = Number.isFinite(val) ? H - 4 - ((val - lo) / span) * (H - 8) : H;
      return `${((i / (vals.length - 1)) * W).toFixed(1)},${y.toFixed(1)}`;
    }).join('L')}`;
  };
  const areaOf = (line: string) => `${line}L${W},${H}L0,${H}Z`;
  const range = (vals: number[]) => { const v = vals.filter(Number.isFinite); return [Math.min(...v), Math.max(...v)] as [number, number]; };
  // one variable's year; in a pair, its line and fills take its colour instead of the accent
  const chartOf = (s: Series, colour: Colour | null) => {
    const line = colour ? {stroke: colour.paint} : undefined;
    const area = colour ? {fill: colour.paint, fillOpacity: 0.16} : undefined;
    let body: React.ReactNode = null;
    if (s.vals.length > 1) {
      if (!s.kept || !scaled) {
        // Actual: one scale for both — from zero for a total, so the accent's height is its share.
        // Unfiltered, the whole passes: the same filled year, so a filter only greys what drops out
        const kept = s.kept ?? s.vals;
        const [klo, khi] = range(kept);
        const lo = s.total ? 0 : Math.min(s.min, klo), hi = Math.max(s.max, khi);
        body = <>{s.kept && <path className="tc-all-area" d={areaOf(pathOf(s.vals, lo, hi))} />}
          <path className="tc-kept-area" style={colour ? {fill: colour.paint, fillOpacity: 0.45} : undefined} d={areaOf(pathOf(kept, lo, hi))} /></>;
      } else {
        const kept = pathOf(s.kept, ...range(s.kept));
        body = <><path className="tc-all-line" d={pathOf(s.vals, s.min, s.max)} vectorEffect="non-scaling-stroke" />
          <path className="tc-area" style={area} d={areaOf(kept)} /><path className="tc-line" style={line} d={kept} vectorEffect="non-scaling-stroke" /></>;
      }
    }
    return (
      <svg className="tc-chart" style={pair ? {height: 44} : undefined} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        onPointerDown={(e) => {
          if (playing) onPlaying(false);   // grabbing the chart pauses
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          seek(e.currentTarget, e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && seek(e.currentTarget, e.clientX)}>
        {colour?.ramp && (
          <defs>
            <linearGradient id={`tc-ramp-${s.variable.key}`} gradientUnits="userSpaceOnUse" x1={0} y1={H} x2={0} y2={0}>
              {colour.ramp.map((c, i) => <stop key={c} offset={i / (colour.ramp!.length - 1)} stopColor={c} />)}
            </linearGradient>
          </defs>
        )}
        {body}
        <line className="tc-head-line" x1={progress * W} x2={progress * W} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
      </svg>
    );
  };
  // how many of the places in view pass, on the playing day
  const places = series?.places[at] ?? 0, passing = series?.passing[at] ?? 0;
  const passText = places <= 1 ? (passing ? 'passes the filters' : 'filtered out')
    : `${passing} / ${places} ${focus.level === 'gu' ? `in ${focus.gu.name}` : 'places'} pass`;
  const playButton = (
    <button className="icon-btn" onClick={() => onPlaying(!playing)}
      aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
      {playing ? '❚❚' : '▶'}
    </button>
  );

  const set = (v: Partial<TimeView>) => onView({...view, ...v});
  const tabs = (
    <div className="tc-tabs" role="tablist" aria-label="How the days are shown">
      <button role="tab" className={`tc-tab${aggregateOn ? ' on' : ''}`} aria-selected={aggregateOn}
        title="Combine the ruler’s period into one value per place"
        onClick={() => set({mode: 'aggregate'})}>Σ Aggregate</button>
      <button role="tab" className={`tc-tab${aggregateOn ? '' : ' on'}`} aria-selected={!aggregateOn}
        title="Play the period day by day" onClick={() => set({mode: 'timeline'})}>◷ Timeline</button>
    </div>
  );
  // Value: Actual, or vs Avg — one bubble with its base inside, each part lit when chosen (Aggregate
  // has one value per place, so no base)
  // (stations, stops and docks: each against its own usual day — against each other, the colour only
  // repeated the circle's size; see timeModes.ts)
  const ownAvg = !!(series && pointsOf(series.variable.key)) && view.show !== 'dong';
  const valueRow = (withBase: boolean) => ownAvg ? (
    <div className="tc-row">
      <span className="tc-lab">Value</span>
      <button className={`tc-pill${view.value === 'actual' ? ' on' : ''}`} onClick={() => set({value: 'actual'})}
        title="The number itself: the circle that day's value, in one teal">Actual</button>
      <span className="tc-combo">
        <button className={view.value === 'avg' ? 'lit' : ''} onClick={() => set({value: 'avg'})}
          title={aggregateOn ? 'The period against its own year: the circle the period, the colour how far from its usual'
            : 'Each one against its own usual day: the circle its usual day, the colour that day ÷ usual'}>vs its avg</button>
      </span>
    </div>
  ) : (
    <div className="tc-row">
      <span className="tc-lab">Value</span>
      <button className={`tc-pill${view.value === 'actual' ? ' on' : ''}`} onClick={() => set({value: 'actual'})}
        title="The number itself, on one scale for the whole period">Actual</button>
      <span className="tc-combo">
        <button className={view.value === 'avg' ? 'lit' : ''} onClick={() => set({value: 'avg'})}
          title={withBase ? `Above or below ${scopeName}'s average — ${view.base === 'same' ? 'on the same day' : 'over all days of the period'}`
            : `Above or below ${scopeName}'s average`}>vs Avg</button>
        {withBase && <>
          <button className={view.value === 'avg' && view.base === 'same' ? 'lit' : ''} onClick={() => set({value: 'avg', base: 'same'})}
            title={`Against the average of ${scopeName}'s places on the same day: where it is higher or lower today`}>same day</button>
          <button className={view.value === 'avg' && view.base === 'all' ? 'lit' : ''} onClick={() => set({value: 'avg', base: 'all'})}
            title="Against the average over all days of the period: seasons and holidays show">all days</button>
        </>}
      </span>
    </div>
  );

  // Show as (data with points): circles for the stations, the busiest of them, or the dong totals;
  // Size: what a circle's area stands for, from the layer's size domain (fixed over the period)
  const pts = series ? pointsOf(series.variable.key) : undefined;
  const SHOW: [ShowAs, string, string][] = [['all', 'All, sized', 'Every one a circle, its area the value'],
    ['top', 'Busiest', 'The busiest sized, the rest as faint specks'], ['only', 'Busiest only', 'Only the busiest'],
    ['dong', 'By dong', 'Summed per dong, like the other variables']];
  const showRow = pts && !paired && (
    <div className="tc-row">
      <span className="tc-lab">Show</span>
      {SHOW.map(([k, label, title]) => (
        <button key={k} className={`tc-pill${view.show === k ? ' on' : ''}`} onClick={() => set({show: k})} title={title}>{label}</button>
      ))}
      {(view.show === 'top' || view.show === 'only') && (
        <span className="tc-combo" title={`The busiest share of the ${pts.what}`}>
          {[1, 5, 10].map((p) => <button key={p} className={view.pct === p ? 'lit' : ''} onClick={() => set({pct: p})}>{p}%</button>)}
        </span>
      )}
    </div>
  );
  const ptsLayer = pts && view.show !== 'dong' ? (visState?.layers || []).find((l: any) => l.id === pointIdOf(series!.variable.key)) : null;
  const sizes = ptsLayer ? sizeLegendOf(ptsLayer) : null;
  const sizeRow = sizes && (
    <div className="tc-row tc-sizes" title={`Circle area by ${aggregateOn ? 'the period' : view.value === 'avg' ? 'its usual day' : 'the day'} — one scale for the whole period`}>
      <span className="tc-lab">Size</span>
      {sizes.map(({r, v}) => (
        <span key={r} className="tc-size"><i style={{width: r * 2, height: r * 2}} />{fmt(v)}</span>
      ))}
    </div>
  );

  if (aggregateOn) {
    const days = Math.round((hi - lo) / DAY) + 1;
    const x = series?.variable;
    const unit = x && x.unit !== 'ratio' && combineFor(x, view.combine) !== 'hotmild' ? ` ${x.unit}` : '';
    const v = x ? aggregateFor(x, datasetOf(x), [lo, hi + DAY], view.combine, focus) : null;
    return (
      <section className="time-card glass tabbed" aria-label="Aggregate">
        {tabs}
        <div className="tc-head">
          <div className="tc-date">
            <span className="tc-day">{lo <= hi ? `${fmtDay(lo)} – ${fmtDay(hi)}` : '—'}</span>
            <span className="tc-dow">{days} days · period from the ruler</span>
          </div>
          <div className="tc-speed">
            <button className="tc-expand" onClick={onExpand} title="Larger timeline — chart, window and playback options"
              aria-label="Open the larger timeline"><Maximize2 size={12} strokeWidth={1.9} /></button>
          </div>
        </div>
        <div className="tc-row">
          <span className="tc-lab">Combine</span>
          {COMBINES.map((c) => (
            <button key={c} className={`tc-pill${x && combineFor(x, view.combine) === c ? ' on' : ''}`} onClick={() => set({combine: c})}
              disabled={c === 'sum' && !!x && !canSum(x)}
              title={c === 'hotmild' ? 'Mean on hot days ÷ mean on mild days (the study’s heat and mild days)'
                : c === 'sum' && x && !canSum(x) ? `${x.short} is a level, not a count: it does not add up over days` : undefined}>
              {COMBINE_LABEL[c]}</button>
          ))}
        </div>
        {valueRow(false)}
        {showRow}
        {sizeRow}
        <div className="tc-foot">
          <span className="tc-sigma" aria-hidden>Σ</span>
          <span className="tc-var">{x?.short}</span>
          <span className="tc-now">{fmt(v)}{v != null && unit}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="time-card glass tabbed" aria-label="Time playback">
      {tabs}
      <div className="tc-head">
        <div className="tc-date">
          <span className="tc-day">{new Date(day).toISOString().slice(0, 10)}</span>
          <span className="tc-dow">{new Date(day).toLocaleDateString('en-US', {weekday: 'long', timeZone: 'UTC'})}</span>
        </div>
        <div className="tc-speed" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button key={s} className={s === speed ? 'on' : ''}
              onClick={() => dispatch(updateFilterAnimationSpeed(idx, s) as any)}>{s}×</button>
          ))}
          {/* larger: kepler's own playback widget, with its chart and window controls */}
          <button className="tc-expand" onClick={onExpand} title="Larger timeline — chart, window and playback options"
            aria-label="Open the larger timeline"><Maximize2 size={12} strokeWidth={1.9} /></button>
        </div>
      </div>

      {pair ? <>
        {/* two daily variables: each named over its own year, in its colour of the pair */}
        {all.map((s) => (
          <div key={s.variable.key}>
            <div className="tc-foot" style={{marginTop: 8}}>
              <span className="tc-var">
                <i style={{display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 6, background: swatchOf(colourOf(s))}} />
                {s.variable.short}
              </span>
              {valueOf(s)}
            </div>
            {chartOf(s, colourOf(s))}
          </div>
        ))}
        {valueRow(true)}
        <div className="tc-foot">{playButton}</div>
      </> : <>
        {series && chartOf(series, colourOf(series))}
        {!series && <svg className="tc-chart" viewBox={`0 0 ${W} ${H}`} />}
        {series && valueRow(true)}
        {showRow}
        {sizeRow}
        <div className="tc-foot">
          {playButton}
          <span className="tc-var">{series?.variable.short}</span>
          {series && valueOf(series)}
        </div>
      </>}
      {series?.kept && (
        <div className="tc-mode">
          {/* the accent swatch keys what passes; the grey is the whole, named under the value */}
          <span className={`tc-pass${scaled ? ' lines' : ''}`} title="Places in view that pass the filters, on this day"
            style={selection.length > 1 ? {color: 'var(--ink-2)'} : undefined}>
            <i style={selection.length > 1 ? {background: 'rgba(255,255,255,0.55)'} : undefined} />{passText}</span>
          <div className="tc-seg" role="group" aria-label="Chart scale">
            <button className={scaled ? '' : 'on'} onClick={() => setScaled(false)}
              title="Both on one scale: how much of the whole passes the filters">Actual</button>
            <button className={scaled ? 'on' : ''} onClick={() => setScaled(true)}
              title="What passes on its own scale: how its year moves">Scaled</button>
          </div>
        </div>
      )}
    </section>
  );
}
