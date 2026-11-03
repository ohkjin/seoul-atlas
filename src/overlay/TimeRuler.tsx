import {useMemo, useRef, useState} from 'react';
import {ChevronUp} from 'lucide-react';
import {DATA_SPAN, asOfOf, coversPeriod, spanOf} from '../data/sources';
import {useVisState} from './useKepler';
import {numericColumn} from './focusValues';
import {THEMES, VAR_BY_KEY, isTemporal, topVarsOf, type Variable} from '../data/catalog';

const DAY = 86400000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_SHOWN = 56;   // Days: about eight weeks around the pointer
const REST = 'rgba(238, 242, 247, 0.5)';   // every variable not on the map, one grey
type Zoom = 'years' | 'days';
export type Period = [number, number];   // [first midnight, the midnight after the last day), UTC
export type Band = {key: string; span: [number, number]; colour: string};

const yearOf = (t: number) => new Date(t).getUTCFullYear();
const monthStart = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const addMonths = (t: number, n: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1); };
// the nearest month start / midnight: where a dragged end lands
const snapMonth = (t: number) => { const a = monthStart(t), b = addMonths(a, 1); return t - a < b - t ? a : b; };
const snapDay = (t: number) => Math.round(t / DAY) * DAY;
// Years shows every year the atlas has data for
const ALL: Period = [Date.UTC(yearOf(DATA_SPAN[0]), 0, 1), Date.UTC(yearOf(DATA_SPAN[1]) + 1, 0, 1)];
const clampView = (v0: number): Period => {
  const len = DAYS_SHOWN * DAY;
  const lo = Math.max(ALL[0], Math.min(ALL[1] - len, v0));
  return [lo, lo + len];
};

type Props = {period: Period; onPeriod: (p: Period) => void; day: number | null; bands: Band[];
  onMap: string[];   // the map's variables, first in the expand
  open: boolean;     // the drawer is open: the expand can open
  expanded: boolean; onExpanded: (on: boolean) => void};

// What a variable is, as time: a value every day (filled, broken where days are missing), one
// value over a period (hollow bar), one value as of a date (hollow ring), or a date the data does
// not record (a faint dashed line). Hollow is always one value.
type Kind = 'daily' | 'aggregate' | 'dated' | 'unknown';
const kindOf = (x: Variable): Kind =>
  spanOf(x.key) ? (isTemporal(x) ? 'daily' : 'aggregate') : asOfOf(x.key) != null ? 'dated' : 'unknown';
const monthsText = (s: [number, number]) => {
  const a = new Date(s[0]), b = new Date(s[1]);
  return a.getUTCFullYear() === b.getUTCFullYear()
    ? `${MON[a.getUTCMonth()]}–${MON[b.getUTCMonth()]} ${a.getUTCFullYear()}`
    : `${MON[a.getUTCMonth()]} ${a.getUTCFullYear()} – ${MON[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
};
const kindText = (x: Variable, kind: Kind) => {
  if (kind === 'daily') return `daily · ${monthsText(spanOf(x.key)!)}`;
  if (kind === 'aggregate') return `over ${monthsText(spanOf(x.key)!)}`;
  if (kind === 'dated') { const d = new Date(asOfOf(x.key)!); return `as of ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
  return 'year not recorded';
};

// The time ruler, above the variable cards: every year the atlas has data for, and on it the
// period you look at — its two ▾ ends, the axis between them lit. The time card plays inside
// the period; the drawer dims what has no data in it. The white tick is the day on the map, the
// thin lines under the axis the map's variables, each in its colour on the map. It has no box
// of its own: closed, it is drawn on the map, and works without opening the drawer; open, it
// rides in the sheet over the cards. Months show as ticks inside the period only while you are
// at it (hovered, the drawer open, or dragging). Zoom: Years, or Days — the eight weeks around
// the pointer (the wheel) or around the playing day (the button); dragging Days' axis pans.
// The period is set in months on Years, in days on Days.
// Open, its ⌃ (left of the zoom) expands it: the axis rises with the sheet to the top, and the
// lines under it unfold into a list down to the cards — every variable's days on the axis (see
// Kind), the map's first, in their colours on the map, the rest in one grey. Lines with no data
// in the period dim. The list scrolls under the axis. On Days a scrollbar under the axis shows
// where the weeks on screen sit.
export default function TimeRuler({period, onPeriod, day, bands, onMap, open, expanded, onExpanded}: Props) {
  const [zoom, setZoom] = useState<Zoom>('years');
  const [view, setView] = useState<Period>(ALL);
  const [dragging, setDragging] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const datasets = useVisState()?.datasets;
  const [v0, v1] = zoom === 'years' ? ALL : view;
  const P = (t: number) => ((t - v0) / (v1 - v0)) * 100;
  const timeAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return v0 + ((clientX - r.left) / r.width) * (v1 - v0);
  };
  const snap = zoom === 'years' ? snapMonth : snapDay;

  const zoomTo = (z: Zoom, at?: number, clientX?: number) => {
    if (z === 'days') {
      const anchor = at ?? day ?? period[0];
      // keep the anchor under the pointer (or centred, from the button)
      const frac = clientX != null && track.current
        ? (clientX - track.current.getBoundingClientRect().left) / track.current.getBoundingClientRect().width : 0.5;
      setView(clampView(anchor - frac * DAYS_SHOWN * DAY));
    }
    setZoom(z);
  };

  // one drag: an end, the whole period, a new period brushed on Years, or Days' axis panned
  const drag = (e: React.PointerEvent, what: 'start' | 'end' | 'move' | 'axis') => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setDragging(true);
    const t0 = timeAt(e.clientX), p0 = period, view0 = view, x0 = e.clientX;
    const move = (ev: PointerEvent) => {
      const t = timeAt(ev.clientX);
      // an end stops a month (Years) or a day (Days) short of the other
      if (what === 'start') onPeriod([Math.max(ALL[0], Math.min(snap(t), zoom === 'years' ? addMonths(p0[1], -1) : p0[1] - DAY)), p0[1]]);
      else if (what === 'end') onPeriod([p0[0], Math.min(ALL[1], Math.max(snap(t), zoom === 'years' ? addMonths(p0[0], 1) : p0[0] + DAY))]);
      else if (what === 'move') {
        // the period keeps its length: shifted by whole months on Years, whole days on Days
        if (zoom === 'years') {
          const n = Math.round((t - t0) / (30.44 * DAY));
          let a = addMonths(p0[0], n), b = addMonths(p0[1], n);
          if (a < ALL[0]) { b = addMonths(b, Math.round((ALL[0] - a) / (30.44 * DAY))); a = ALL[0]; }
          if (b > ALL[1]) { a = addMonths(a, -Math.round((b - ALL[1]) / (30.44 * DAY))); b = ALL[1]; }
          onPeriod([a, b]);
        } else {
          const n = Math.round((t - t0) / DAY) * DAY;
          const k = Math.max(ALL[0] - p0[0], Math.min(ALL[1] - p0[1], n));
          onPeriod([p0[0] + k, p0[1] + k]);
        }
      } else if (zoom === 'days') {
        const r = track.current!.getBoundingClientRect();
        setView(clampView(view0[0] - ((ev.clientX - x0) / r.width) * (view0[1] - view0[0])));
      } else if (Math.abs(ev.clientX - x0) > 4) {
        const a = snap(Math.min(t0, t)), b = snap(Math.max(t0, t));
        onPeriod([Math.max(ALL[0], a), Math.min(ALL[1], Math.max(b, addMonths(a, 1)))]);
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setDragging(false);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const inside = (t: number) => t > period[0] && t < period[1];
  const vis = (t: number) => t >= v0 && t <= v1;
  const marks: React.ReactNode[] = [];
  if (zoom === 'years') {
    for (let y = yearOf(v0); y <= yearOf(v1 - 1); y++) {
      const a = Date.UTC(y, 0, 1), b = Date.UTC(y + 1, 0, 1);
      marks.push(<i key={`y${y}`} className={`tr-tk major${inside(a) ? ' in' : ''}`} style={{left: `${P(a)}%`}} />);
      for (let m = 1; m < 12; m++) {
        const t = Date.UTC(y, m, 1);
        if (inside(t)) marks.push(<i key={`m${y}-${m}`} className="tr-tk minor in" style={{left: `${P(t)}%`}} />);
      }
      const lit = period[0] < b && period[1] > a;
      marks.push(<span key={`l${y}`} className={`tr-lb${lit ? ' in' : ''}`} style={{left: `${P(Date.UTC(y, 6, 1))}%`}}>{y}</span>);
    }
    marks.push(<i key="yend" className="tr-tk major" style={{left: `${P(v1)}%`}} />);
  } else {
    for (let t = Math.ceil(v0 / DAY) * DAY; t <= v1; t += DAY) {
      const d = new Date(t), date = d.getUTCDate();
      if (date === 1) {
        marks.push(<i key={`d${t}`} className={`tr-tk major${inside(t) ? ' in' : ''}`} style={{left: `${P(t)}%`}} />);
        marks.push(<span key={`l${t}`} className={`tr-lb left${t >= period[0] && t < period[1] ? ' in' : ''}`} style={{left: `${P(t)}%`}}>
          {MON[d.getUTCMonth()]} {d.getUTCFullYear()}</span>);
      } else {
        if (inside(t)) marks.push(<i key={`d${t}`} className="tr-tk minor in" style={{left: `${P(t)}%`}} />);
        if ((date - 1) % 7 === 0 && date < 26) marks.push(<span key={`l${t}`} className={`tr-lb day${t >= period[0] && t < period[1] ? ' in' : ''}`}
          style={{left: `${P(t)}%`}}>{date}</span>);
      }
    }
  }
  const a = Math.max(period[0], v0), b = Math.min(period[1], v1);

  // The days each daily variable has a value on, read from its loaded rows (an industry not yet
  // loaded keeps its dataset's span): runs of days, so a missing day breaks its bar.
  const runs = useMemo(() => {
    const out: Record<string, [number, number][]> = {};
    if (!expanded || !datasets) return out;
    const daily = [...onMap.map((k) => VAR_BY_KEY[k]).filter(Boolean), ...THEMES.flatMap((t) => topVarsOf(t.key))]
      .filter((x) => kindOf(x) === 'daily');
    for (const x of daily) {
      const ds = [datasets[x.dataset], datasets.gu_daily].find((d: any) => d?.fields?.some((f: any) => f.name === x.key));
      const dateField = ds?.fields.find((f: any) => f.name === 'date');
      if (!ds || !dateField || out[x.key]) continue;
      const t = numericColumn(ds, dateField), v = numericColumn(ds, ds.fields.find((f: any) => f.name === x.key));
      const n = Math.round((ALL[1] - ALL[0]) / DAY), has = new Uint8Array(n);
      for (let r = 0; r < t.length; r++) {
        const d = Math.round((t[r] - ALL[0]) / DAY);
        if (d >= 0 && d < n && Number.isFinite(v[r])) has[d] = 1;
      }
      const list: [number, number][] = [];
      for (let d = 0; d < n; d++) {
        if (!has[d]) continue;
        const start = d;
        while (d + 1 < n && has[d + 1]) d++;
        list.push([ALL[0] + start * DAY, ALL[0] + (d + 1) * DAY]);
      }
      out[x.key] = list;
    }
    return out;
  }, [expanded, datasets?.gu_daily, datasets?.dong_daily, onMap.join()]);   // eslint-disable-line react-hooks/exhaustive-deps

  // one variable's line in the expand: its name at the start of its days, the days under it
  const colourOf: Record<string, string> = Object.fromEntries(bands.map((x) => [x.key, x.colour]));
  const lineOf = (x: Variable, mapped = false) => {
    const kind = kindOf(x), colour = colourOf[x.key] ?? REST;
    const span = spanOf(x.key), date = asOfOf(x.key);
    const bar = (s0: number, e0: number, key: string | number = 0) => {
      const s = Math.max(s0, v0), e = Math.min(e0, v1);
      return e > s && <i key={key} className={`tr-bar ${kind}`}
        style={{left: `${P(s)}%`, width: `${P(e) - P(s)}%`, ...(kind === 'daily' ? {background: colour} : {borderColor: colour})}} />;
    };
    const start = kind === 'dated' ? P(date!) : span ? P(Math.max(span[0], v0)) : 0;
    return (
      <div key={x.key} className={`tr-line${mapped ? ' onmap' : ''}${coversPeriod(x.key, period) ? '' : ' off'}`}>
        <span className="tr-nm" style={{left: `${Math.max(0, start)}%`}}>{x.short}<small>{kindText(x, kind)}</small></span>
        {kind === 'daily' && (runs[x.key] ?? [[span![0], span![1] + DAY]]).map(([s, e], i) => bar(s, e, i))}
        {kind === 'aggregate' && bar(span![0], span![1] + DAY)}
        {kind === 'dated' && vis(date!) && <i className="tr-ring" style={{left: `${P(date!)}%`, borderColor: colour}} />}
        {kind === 'unknown' && <i className="tr-snap" />}
      </div>
    );
  };
  // Days: where the eight weeks on screen sit in the whole span; drag the thumb, or click the bar
  const scrub = (e: React.PointerEvent, onThumb: boolean) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement, bar = (onThumb ? el.parentElement : el)!.getBoundingClientRect();
    const len = view[1] - view[0], whole = ALL[1] - ALL[0];
    if (!onThumb) setView(clampView(ALL[0] + ((e.clientX - bar.left) / bar.width) * whole - len / 2));
    el.setPointerCapture(e.pointerId);
    setDragging(true);
    const x0 = e.clientX, start = onThumb ? view[0] : clampView(ALL[0] + ((e.clientX - bar.left) / bar.width) * whole - len / 2)[0];
    const move = (ev: PointerEvent) => setView(clampView(start + ((ev.clientX - x0) / bar.width) * whole));
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); setDragging(false); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const wheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0 && zoom === 'years') zoomTo('days', timeAt(e.clientX), e.clientX);
    else if (e.deltaY > 0 && zoom === 'days') zoomTo('years');
  };

  return (
    <div className={`time-ruler${dragging ? ' dragging' : ''}`}>
      {open && expanded && (
        <div className="tr-cov">
          {b > a && <i className="tr-win" style={{left: `${P(a)}%`, width: `${P(b) - P(a)}%`}} />}
          {/* the map's variables first, right under the axis: its two lines, unfolded */}
          {onMap.map((k) => VAR_BY_KEY[k] && lineOf(VAR_BY_KEY[k], true))}
          {THEMES.map((t) => {
            const vars = topVarsOf(t.key).filter((x) => !onMap.includes(x.key));
            return vars.length > 0 && (
              <div key={t.key}>
                <div className="tr-grp">{t.label}</div>
                {vars.map((x) => lineOf(x))}
              </div>
            );
          })}
        </div>
      )}
      <div className={`tr-track ${zoom}`} ref={track} onWheel={wheel} onPointerDown={(e) => drag(e, 'axis')}>
        <i className="tr-base" />
        {b > a && <i className="tr-seg" style={{left: `${P(a)}%`, width: `${P(b) - P(a)}%`}} onPointerDown={(e) => drag(e, 'move')}
          title="Drag to move the period" />}
        {marks}
        {vis(period[0]) && <button className="tr-cap" style={{left: `${P(period[0])}%`}} onPointerDown={(e) => drag(e, 'start')}
          aria-label="Period start" title={new Date(period[0]).toISOString().slice(0, 10)} />}
        {vis(period[1]) && <button className="tr-cap" style={{left: `${P(period[1])}%`}} onPointerDown={(e) => drag(e, 'end')}
          aria-label="Period end" title={new Date(period[1] - DAY).toISOString().slice(0, 10)} />}
        {period[0] < v0 && <span className="tr-more l" aria-hidden>◂</span>}
        {period[1] > v1 && <span className="tr-more r" aria-hidden>▸</span>}
        {day != null && vis(day) && <i className="tr-day" style={{left: `${P(day)}%`}} />}
        {bands.map((x, i) => {
          const s = Math.max(x.span[0], v0), e = Math.min(x.span[1] + DAY, v1);
          return e > s && <i key={x.key} className="tr-band" style={{top: 29 + i * 5, left: `${P(s)}%`, width: `${P(e) - P(s)}%`, background: x.colour}} />;
        })}
        {zoom === 'days' && (
          <div className="tr-sb" onPointerDown={(e) => scrub(e, false)}>
            <i style={{left: `${((view[0] - ALL[0]) / (ALL[1] - ALL[0])) * 100}%`, width: `${((view[1] - view[0]) / (ALL[1] - ALL[0])) * 100}%`}}
              onPointerDown={(e) => scrub(e, true)} />
          </div>
        )}
      </div>
      <div className="tr-side" onWheel={wheel}>
        {open && (
          <button className={`tr-expand${expanded ? ' on' : ''}`} aria-expanded={expanded} onClick={() => onExpanded(!expanded)}
            title={expanded ? 'Fold back' : 'Every variable’s days on the ruler'} aria-label={expanded ? 'Fold back' : 'Expand'}>
            <ChevronUp size={15} strokeWidth={2.2} />
          </button>
        )}
        <div className="tr-zoom" role="group" aria-label="Ruler zoom">
          <button className={zoom === 'years' ? 'on' : ''} aria-pressed={zoom === 'years'} onClick={() => zoomTo('years')}>Years</button>
          <button className={zoom === 'days' ? 'on' : ''} aria-pressed={zoom === 'days'} onClick={() => zoomTo('days')}
            title="The weeks around the playing day">Days</button>
        </div>
      </div>
    </div>
  );
}
