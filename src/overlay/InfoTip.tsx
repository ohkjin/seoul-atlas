import {useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Info} from 'lucide-react';
import type {Variable} from '../data/catalog';
import {uiZoom} from './uiScale';

const GRAIN: Record<Variable['dataset'], string> = {
  dong: 'Neighbourhood · static', gu_daily: 'District · daily', dong_daily: 'Neighbourhood · daily'
};
const POP_W = 260;

// ⓘ right after a variable's name. Hovering or focusing it opens a card beside the icon
// saying what the variable is; moving off closes it — nothing to dismiss. The card is
// drawn into <body>, so no scrolling list or panel edge can clip it, and it flips left or
// up when the icon is near the right or bottom of the screen. A tap toggles it on touch.
export default function InfoTip({x}: {x: Variable}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{left: number; top: number; up: boolean} | null>(null);
  const show = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const z = uiZoom(), w = POP_W * z;
    const right = r.right + 8 + w <= window.innerWidth - 12;
    const up = r.top > window.innerHeight / 2;
    setAt({left: (right ? r.right + 8 : r.left - 8 - w) / z, top: (up ? r.bottom : r.top) / z, up});
  };
  const hide = () => setAt(null);
  return (
    <>
      <button ref={btn} type="button" className="info-tip" aria-label={`About ${x.short}`}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (at) hide(); else show(); }}>
        <Info size={14} strokeWidth={1.75} />
      </button>
      {at && createPortal(
        <div className={`info-pop${at.up ? ' up' : ''}`} role="tooltip" style={{left: at.left, top: at.top, width: POP_W}}>
          <p className="ip-full">{x.full}</p>
          <dl>
            <dt>Unit</dt><dd>{x.unit}</dd>
            <dt>Grain</dt><dd>{GRAIN[x.dataset]}</dd>
            <dt>Combined</dt><dd>{x.how === 'sum' ? 'summed over places' : 'averaged over places'}</dd>
            <dt>Source</dt><dd>{x.source}</dd>
          </dl>
        </div>,
        document.body
      )}
    </>
  );
}
