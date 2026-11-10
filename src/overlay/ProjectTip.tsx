import {createPortal} from 'react-dom';
import {Info} from 'lucide-react';
import type {Project} from '../data/projects';
import {useTip} from './InfoTip';

const POP_W = 300;

// ⓘ after a study's name: its card — what it asks, its index, the data it is built on — opened
// the way a variable's ⓘ is (InfoTip), but in white so the study's head reads as one.
export default function ProjectTip({p}: {p: Project}) {
  const {at, trigger} = useTip(POP_W);
  return (
    <>
      <button {...trigger} type="button" className="info-tip bright" aria-label={`About ${p.id}`}>
        <Info size={14} strokeWidth={1.75} />
      </button>
      {at && createPortal(
        <div className={`info-pop${at.up ? ' up' : ''}`} role="tooltip" style={{left: at.left, top: at.top, width: POP_W}}>
          <p className="ip-kicker">✧ Study</p>
          <p className="ip-full">{p.id} · {p.name}</p>
          <p className="ip-about">{p.about}</p>
          <dl>
            <dt>Question</dt><dd>{p.question}</dd>
            <dt>Index</dt><dd>{p.index}</dd>
            <dt>Data</dt><dd>{p.data}</dd>
            <dt>Period</dt><dd>{p.period}</dd>
            <dt>By</dt><dd>{p.by}</dd>
          </dl>
        </div>,
        document.body
      )}
    </>
  );
}
