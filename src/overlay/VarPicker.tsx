import {Fragment, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {THEMES, childrenOf, topVarsOf, type Variable} from '../data/catalog';

// A variable from every theme, picked from a glass list that hangs under what opened it —
// the place sentence's list, with a search on top. The left panel's cards open it to put
// another variable in their place, or to link a second one (FocusBlock).
type Props = {left: number; top: number; current: string | null; onMap: string[];
  onPick: (key: string) => void; onClose: () => void; clear?: {label: string; onClick: () => void}};

export default function VarPicker({left, top, current, onMap, onPick, onClose, clear}: Props) {
  const [q, setQ] = useState('');
  const pop = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!pop.current?.contains(t) && !t.closest?.('.lc-pick, .lc-compare')) onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc); };
  }, [onClose]);

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (x: Variable) => words.every((w) => `${x.short} ${x.full}`.toLowerCase().includes(w));
  const item = (x: Variable, child = false) => (
    <button key={x.key} className={`${x.key === current ? 'on' : ''}${child ? ' child' : ''}`} onClick={() => onPick(x.key)}>
      {x.short}{onMap.includes(x.key) && <small>on the map</small>}
    </button>
  );
  return createPortal(
    <div ref={pop} className="place-pop var-pop" role="listbox" style={{left, top}}>
      <input ref={input} className="vp-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a variable" />
      {clear && !words.length && <button className="vp-clear" onClick={clear.onClick}>{clear.label}</button>}
      {THEMES.map((t) => {
        // a folder head stays when it or any of its contents matches; under a search the
        // contents show without their head's folding
        const rows = topVarsOf(t.key).map((x) => ({x, kids: childrenOf(x.key).filter(hit)})).filter(({x, kids}) => hit(x) || kids.length);
        if (!rows.length) return null;
        return (
          <Fragment key={t.key}>
            <div className="pp-head">{t.label}</div>
            <div className="pp-grid one">
              {rows.map(({x, kids}) => <Fragment key={x.key}>{item(x)}{(words.length || kids.some((k) => k.key === current)) && kids.map((k) => item(k, true))}</Fragment>)}
            </div>
          </Fragment>
        );
      })}
    </div>,
    document.body
  );
}
