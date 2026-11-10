import {useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Info} from 'lucide-react';
import type {Variable} from '../data/catalog';
import {TIER_LABEL, provenanceOf, type Tier} from '../data/sources';
import {uiZoom} from './uiScale';

const GRAIN: Record<Variable['dataset'], string> = {
  dong: 'Neighborhood · static', gu_daily: 'District · daily', dong_daily: 'Neighborhood · daily'
};
const POP_W = 280;
const TIERS: Tier[] = ['source', 'processed', 'research'];

// An ⓘ's opening: where its card goes, and what its button listens to. (ProjectTip too.)
export function useTip(width: number) {
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{left: number; top: number; up: boolean} | null>(null);
  const show = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const z = uiZoom(), w = width * z;
    const right = r.right + 8 + w <= window.innerWidth - 12;
    const up = r.top > window.innerHeight / 2;
    setAt({left: (right ? r.right + 8 : r.left - 8 - w) / z, top: (up ? r.bottom : r.top) / z, up});
  };
  const hide = () => setAt(null);
  return {at, trigger: {ref: btn, onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide,
    onClick: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); if (at) hide(); else show(); }}};
}

// ⓘ right after a variable's name. Hovering or focusing it opens a card beside the icon
// saying what the variable is; moving off closes it — nothing to dismiss. The card is
// drawn into <body>, so no scrolling list or panel edge can clip it, and it flips left or
// up when the icon is near the right or bottom of the screen. A tap toggles it on touch.
export default function InfoTip({x}: {x: Variable}) {
  const {at, trigger} = useTip(POP_W);
  const prov = at ? provenanceOf(x.key) : null;
  return (
    <>
      <button {...trigger} type="button" className="info-tip" aria-label={`About ${x.short}`}>
        <Info size={14} strokeWidth={1.75} />
      </button>
      {at && createPortal(
        <div className={`info-pop${at.up ? ' up' : ''}`} role="tooltip" style={{left: at.left, top: at.top, width: POP_W}}>
          <p className="ip-full">{x.full}</p>
          {/* the steps it was built through, its own lit (sources.ts provenanceOf) */}
          {prov && (
            <div className="ip-ladder">
              {TIERS.map((t, i) => (
                <div key={t} className={`ip-step${t === prov.tier ? ' here' : i < TIERS.indexOf(prov.tier) ? ' done' : ''}`}>
                  <b>{TIER_LABEL[t]}</b>{prov.ladder[i]}
                </div>
              ))}
            </div>
          )}
          <dl>
            <dt>Unit</dt><dd>{x.unit}</dd>
            <dt>Grain</dt><dd>{GRAIN[x.dataset]}</dd>
            <dt>Combined</dt><dd>{x.how === 'sum' ? 'summed over places' : 'averaged over places'}</dd>
            <dt>Source</dt><dd>{x.source}</dd>
            {prov && <><dt>Used by</dt><dd>{prov.usedBy.join(', ')}</dd>
              <dt>Access</dt><dd>{prov.restricted ? 'Restricted' : 'Open'}</dd></>}
          </dl>
        </div>,
        document.body
      )}
    </>
  );
}
