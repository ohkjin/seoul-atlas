import {useEffect, useRef, useState} from 'react';
import {fmt} from './focusValues';

type Props = {domain: [number, number]; value: [number, number] | null; hist: number[]; unit: string;
  count: [number, number] | null; onChange: (range: [number, number] | null) => void};

// A value range on one variable, in the card that shows it: the variable's distribution
// as bars, a band with two handles over it, the two ends, and how many places pass. The
// band follows the pointer at once; the filter itself is updated at most once a frame.
export default function RangeFilter({domain, value, hist, unit, count, onChange}: Props) {
  const [lo0, hi0] = domain;
  const span = hi0 - lo0 || 1;
  const [draft, setDraftState] = useState<[number, number]>(value ?? domain);
  const current = useRef(draft);
  const setDraft = (d: [number, number]) => { current.current = d; setDraftState(d); };
  useEffect(() => { setDraft(value ?? domain); }, [value?.[0], value?.[1], lo0, hi0]);   // eslint-disable-line react-hooks/exhaustive-deps
  const track = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const commit = (r: [number, number]) => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => onChange(r[0] <= lo0 && r[1] >= hi0 ? null : r));
  };
  const at = (clientX: number) => {
    const b = track.current!.getBoundingClientRect();
    return lo0 + Math.max(0, Math.min(1, (clientX - b.left) / b.width)) * span;
  };
  const drag = (which: 0 | 1) => (e: React.PointerEvent) => {
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* no live pointer to capture */ }
    const move = (ev: PointerEvent) => {
      const v = at(ev.clientX), d = current.current;
      const next: [number, number] = which === 0 ? [Math.min(v, d[1]), d[1]] : [d[0], Math.max(v, d[0])];
      setDraft(next);
      commit(next);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const pct = (v: number) => `${((v - lo0) / span) * 100}%`;
  const max = Math.max(1, ...hist);
  const unitText = unit !== 'ratio' && unit !== 'log-ratio' ? ` ${unit}` : '';
  return (
    <div className="rf">
      <div className="rf-hist" aria-hidden>
        {hist.map((n, i) => {
          const mid = lo0 + ((i + 0.5) / hist.length) * span;
          return <i key={i} className={mid >= draft[0] && mid <= draft[1] ? 'in' : ''} style={{height: `${(n / max) * 100}%`}} />;
        })}
      </div>
      <div ref={track} className="rf-track">
        <i className="rf-band" style={{left: pct(draft[0]), width: `calc(${pct(draft[1])} - ${pct(draft[0])})`}} />
        <button className="rf-thumb" style={{left: pct(draft[0])}} onPointerDown={drag(0)} aria-label="Lowest value kept" />
        <button className="rf-thumb" style={{left: pct(draft[1])}} onPointerDown={drag(1)} aria-label="Highest value kept" />
      </div>
      <div className="rf-vals">
        <span>{fmt(draft[0])}{unitText}</span>
        {count && <span className="rf-count">{count[0]} / {count[1]} places</span>}
        <span>{fmt(draft[1])}{unitText}</span>
      </div>
      {value && <button className="rf-reset" onClick={() => onChange(null)}>Clear filter</button>}
    </div>
  );
}
