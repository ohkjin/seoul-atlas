import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import type {Place, UhusData} from '../data/uhus';
import type {Focus} from './Overlay';
import type {Grain} from './layers';
import {uiZoom} from './uiScale';

// Where the map is and how it is drawn, as one line under the place name — "Gangnam-gu —
// 22 neighbourhoods, mapped by neighbourhood." Each underlined word opens a glass list:
// the districts, the district's neighbourhoods, or the two map grains. It stands in for
// the Gu/Dong switch and the two dropdowns that sat here before.
type Props = {data: UhusData; focus: Focus; grain: Grain; onSeoul: () => void; onGu: (g: Place) => void;
  onDong: (d: Place) => void; onGrain: (g: Grain) => void};
type Open = {list: 'gus' | 'dongs' | 'grain'; left: number; top: number};

export default function PlaceSentence({data, focus, grain, onSeoul, onGu, onDong, onGrain}: Props) {
  const [open, setOpen] = useState<Open | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  const gu = focus.level === 'seoul' ? null : focus.gu;
  const dong = focus.level === 'dong' ? focus.dong : null;
  const dongsInGu = gu ? data.dongs.filter((d) => d.guCode === gu.code).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const gus = [...data.gus].sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!pop.current?.contains(t) && !t.closest?.('.sentence-word')) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc); };
  }, [open]);
  useEffect(() => setOpen(null), [focus, grain]);

  // the list hangs under its word, in the overlay's zoomed pixels (it is drawn into <body>)
  const toggle = (list: Open['list']) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (open?.list === list) { setOpen(null); return; }
    const r = e.currentTarget.getBoundingClientRect(), z = uiZoom();
    setOpen({list, left: r.left / z, top: (r.bottom + 8) / z});
  };
  const word = (list: Open['list'], text: string) => (
    <button className={`sentence-word${open?.list === list ? ' open' : ''}`} aria-haspopup="listbox"
      aria-expanded={open?.list === list} onClick={toggle(list)}>{text}</button>
  );
  const unit = grain === 'dong' ? 'neighbourhood' : 'district';
  const pick = (go: () => void) => () => { setOpen(null); go(); };

  return (
    <p className="sentence">
      {!gu ? <>All of Seoul — {word('gus', `${data.gus.length} districts`)}, mapped by {word('grain', unit)}.</>
        : dong ? <>{word('dongs', dong.name)}, in {word('gus', gu.name)}, mapped by {word('grain', unit)}.</>
        : <>{word('gus', gu.name)} — {word('dongs', `${dongsInGu.length} neighbourhoods`)}, mapped by {word('grain', unit)}.</>}
      {open && createPortal(
        <div ref={pop} className="place-pop" role="listbox" style={{left: open.left, top: open.top}}>
          {open.list === 'gus' && (
            <div className="pp-grid">
              <button className={`pp-all${!gu ? ' on' : ''}`} onClick={pick(onSeoul)}>All of Seoul</button>
              {gus.map((g) => <button key={g.code} className={gu?.code === g.code ? 'on' : ''} onClick={pick(() => onGu(g))}>{g.name}</button>)}
            </div>
          )}
          {open.list === 'dongs' && gu && (
            <div className={`pp-grid${dongsInGu.length < 8 ? ' one' : ''}`}>
              <button className={`pp-all${!dong ? ' on' : ''}`} onClick={pick(() => onGu(gu))}>All of {gu.name}</button>
              {dongsInGu.map((d) => <button key={d.code} className={dong?.code === d.code ? 'on' : ''} onClick={pick(() => onDong(d))}>{d.name}</button>)}
            </div>
          )}
          {open.list === 'grain' && (
            <>
              <div className="pp-head">Map by</div>
              <div className="pp-grid one">
                {(['gu', 'dong'] as Grain[]).map((g) => (
                  <button key={g} className={grain === g ? 'on' : ''} onClick={pick(() => onGrain(g))}>
                    {g === 'gu' ? 'District' : 'Neighbourhood'}<small>{g === 'gu' ? data.gus.length : data.dongs.length} areas</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </p>
  );
}
