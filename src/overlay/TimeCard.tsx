import {useEffect, useMemo, useRef} from 'react';
import {useDispatch, useStore} from 'react-redux';
import {setFilter, updateFilterAnimationSpeed} from '@kepler.gl/actions';
import type {Focus} from './Overlay';
import {useKepler} from './useKepler';
import {VAR_BY_KEY, isTemporal} from '../data/catalog';
import {dataIdFor, type Grain} from './layers';
import {fmt, numericColumn} from './focusValues';
import {Maximize2} from 'lucide-react';

const DAY = 86400000;
const SPEEDS = [0.5, 1, 2];
const DAYS_PER_SECOND = 10;   // at 1×: a year in ~37 s
const W = 288, H = 64;   // chart viewBox; the SVG scales to the card width

// The time control: a full card at the foot of the right column, in the spirit of kepler's
// enlarged playback widget — a date, a year-long chart of the playing variable for the
// focused place, a playhead, and play / speed.
// Playback steps a whole day at a time. kepler's own player slides its window a little
// every frame, and each step refilters every row on the CPU — 154k rows once the per-dong
// daily data joined, ~13 ms a frame, which held playback near 30fps. The data is daily, so
// nothing new shows between midnights anyway: stepping by day costs that 10–20 times a
// second instead of 60, and the map keeps its frame rate in between.
type Props = {focus: Focus; selection: string[]; grain: Grain; playing: boolean; onPlaying: (on: boolean) => void;
  onExpand: () => void};
export default function TimeCard({focus, selection, grain, playing, onPlaying, onExpand}: Props) {
  const dispatch = useDispatch();
  const store = useStore<any>();
  const kepler = useKepler();
  const chart = useRef<SVGSVGElement>(null);
  const visState = kepler?.visState;
  const filters = visState?.filters || [];
  const idx = filters.findIndex((f: any) => f.id === 'time');
  const f = filters[idx];
  // The first daily variable selected, read from the rows its grain draws (per-dong
  // sales load on demand; until then the district rows hold the same totals).
  const variable = selection.map((k) => VAR_BY_KEY[k]).find((x) => x && isTemporal(x));
  const dataset = variable ? visState?.datasets?.[dataIdFor(variable, grain)] ?? visState?.datasets?.gu_daily : undefined;
  // A neighbourhood is read from its own rows where the data has them, else from its
  // district's; Seoul and districts add up (sales) or average (temperature) their rows.
  const byDong = focus.level === 'dong' && !!dataset?.fields.some((x: any) => x.name === 'dong_code');
  const placeCode = focus.level === 'seoul' ? null : byDong ? (focus as any).dong.code : focus.gu.code;

  const series = useMemo(() => {
    if (!dataset || !variable || !f?.domain) return null;
    const dateField = dataset.fields.find((x: any) => x.name === 'date');
    const valueField = dataset.fields.find((x: any) => x.name === variable.key);
    const placeIdx = dataset.fields.findIndex((x: any) => x.name === (byDong ? 'dong_code' : 'gu_code'));
    if (!dateField || !valueField) return null;
    const t = numericColumn(dataset, dateField), v = numericColumn(dataset, valueField);
    const [lo, hi] = f.domain as [number, number];
    const n = Math.round((hi - lo) / DAY) + 1;
    const sum = new Float64Array(n), cnt = new Uint32Array(n);
    for (let r = 0; r < t.length; r++) {
      if (placeCode && String(dataset.dataContainer.valueAt(r, placeIdx)) !== placeCode) continue;
      const d = Math.round((t[r] - lo) / DAY);
      if (d < 0 || d >= n || !Number.isFinite(v[r])) continue;
      sum[d] += v[r]; cnt[d]++;
    }
    const total = variable.how === 'sum';
    const vals = Array.from(sum, (s, i) => (cnt[i] ? (total ? s : s / cnt[i]) : NaN));
    const finite = vals.filter(Number.isFinite);
    return {vals, min: Math.min(...finite), max: Math.max(...finite)};
  }, [dataset, variable, placeCode, byDong, f?.domain]);

  const speedNow = f?.speed ?? 1;
  useEffect(() => {
    if (!playing || idx < 0) return;
    const t = window.setInterval(() => {
      const cur = store.getState().keplerGl.map.visState.filters[idx];
      if (!cur?.domain || !cur?.value) return;
      const [lo, hi] = cur.domain as [number, number];
      const day = Math.min(hi, Math.ceil(cur.value[0] / DAY) * DAY);
      const next = day + DAY > hi ? lo : day + DAY;   // loop back to the first day
      dispatch(setFilter(idx, 'value', [next, next + DAY - 1]) as any);
    }, 1000 / (DAYS_PER_SECOND * speedNow));
    return () => window.clearInterval(t);
  }, [playing, idx, speedNow]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPlaying(false), []);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!f?.domain || !f?.value) return null;
  const [lo, hi] = f.domain as [number, number];
  const day = Math.min(hi, Math.ceil(f.value[0] / DAY) * DAY);   // the one midnight in the window
  const progress = (day - lo) / Math.max(1, hi - lo);
  const speed = f.speed ?? 1;
  const today = series ? series.vals[Math.round((day - lo) / DAY)] : NaN;

  const seek = (clientX: number) => {
    const r = chart.current!.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const start = lo + Math.round((p * (hi - lo)) / DAY) * DAY;
    dispatch(setFilter(idx, 'value', [start, start + DAY - 1]) as any);
  };

  let line = '', area = '';
  if (series && series.vals.length > 1) {
    const span = series.max - series.min || 1;
    const pts = series.vals.map((val, i) => {
      const x = (i / (series.vals.length - 1)) * W;
      const y = Number.isFinite(val) ? H - 4 - ((val - series.min) / span) * (H - 8) : H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    line = `M${pts.join('L')}`;
    area = `${line}L${W},${H}L0,${H}Z`;
  }

  return (
    <section className="time-card glass" aria-label="Time playback">
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

      <svg ref={chart} className="tc-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        onPointerDown={(e) => {
          if (playing) onPlaying(false);   // grabbing the chart pauses
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          seek(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && seek(e.clientX)}>
        {area && <path className="tc-area" d={area} />}
        {line && <path className="tc-line" d={line} vectorEffect="non-scaling-stroke" />}
        <line className="tc-head-line" x1={progress * W} x2={progress * W} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="tc-foot">
        <button className="icon-btn" onClick={() => onPlaying(!playing)}
          aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="tc-var">{variable?.short}</span>
        <span className="tc-now">{fmt(Number.isFinite(today) ? today : null)}{variable && variable.unit !== 'ratio' ? ` ${variable.unit}` : ''}</span>
      </div>
    </section>
  );
}
