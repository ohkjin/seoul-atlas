import {Fragment, useEffect, useRef, useState} from 'react';
import {useDispatch} from 'react-redux';
import {Link2, X} from 'lucide-react';
import {THEMES, VAR_BY_KEY, varsOf, type ThemeKey} from '../data/catalog';
import type {Focus} from './Overlay';
import {useKepler} from './useKepler';
import {focusValue, fmt} from './focusValues';
import InfoTip from './InfoTip';
import {iconFor} from './icons';
import {MAX_SELECTED, dataIdFor, type Grain} from './layers';

const HOVER_INTENT_MS = 250;

type Props = {
  grain: Grain;
  focus: Focus;
  headline: Record<ThemeKey, string>;
  setHeadline: (theme: ThemeKey, key: string) => void;
  selection: string[];
  onSelect: (key: string) => void;
};

// The bottom drawer. Closed, it is six floating theme cards. Open, a sheet rises from
// the bottom edge carrying the cards on its top edge, and each theme's variable list
// sits directly under its own card. While open it may cover anything else on screen.
export default function Drawer({focus, grain, headline, setHeadline, selection, onSelect}: Props) {
  const dispatch = useDispatch();
  const kepler = useKepler();
  const visState = kepler?.visState;
  const datasets = visState?.datasets || {};
  const filters = visState?.filters || [];

  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);
  const downAt = useRef<{x: number; y: number} | null>(null);

  const close = () => { setOpen(false); setPinned(false); };
  const pin = () => { setOpen(true); setPinned(true); };

  // Hover intent: the pointer has to rest on the bar, so sweeping across it while
  // panning the map does not throw the sheet open.
  const enter = () => {
    window.clearTimeout(timer.current);
    if (!open) timer.current = window.setTimeout(() => setOpen(true), HOVER_INTENT_MS);
  };
  const leave = () => {
    window.clearTimeout(timer.current);
    if (!pinned) timer.current = window.setTimeout(() => setOpen(false), HOVER_INTENT_MS);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Outside click or Esc closes. A drag that pans the map is not a click.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { downAt.current = {x: e.clientX, y: e.clientY}; };
    const up = (e: PointerEvent) => {
      const s = downAt.current; downAt.current = null;
      if (!s || Math.hypot(e.clientX - s.x, e.clientY - s.y) > 5) return;
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div className={`drawer${open ? ' open' : ''}`} ref={root} onMouseEnter={enter} onMouseLeave={leave}>
      <div className="drawer-sheet glass" aria-hidden />
      {open && (
        <button className="drawer-close icon-btn" aria-label="Close" onClick={close}>
          <X size={16} strokeWidth={1.75} />
        </button>
      )}
      <div className="drawer-cols">
        {THEMES.map((t) => {
          const lead = VAR_BY_KEY[headline[t.key]];
          // the headline's value from the rows its grain draws; daily sales per dong load
          // on demand, so until then the district rows give the same city / district totals
          const rows = !lead ? null : lead.dataset === 'dong_daily'
            ? datasets[dataIdFor(lead, grain)] ?? datasets.gu_daily : datasets[lead.dataset];
          const value = lead ? focusValue(rows, lead.key, focus, lead.how, filters) : null;
          const Icon = iconFor(lead, value);
          return (
            <section key={t.key} className="dcol">
              <button className="dcard" onClick={pin}>
                {Icon && <Icon className="dc-icon" size={26} strokeWidth={1.5} aria-hidden />}
                <span className="dc-text">
                  <span className="dc-theme">{t.label}</span>
                  <span className="dc-value">{fmt(value)}</span>
                  <span className="dc-var">{lead?.short}</span>
                </span>
              </button>
              <ul className="dlist" onClick={() => setPinned(true)}>
                {/* neighbourhood-level variables first; those that exist per district only
                    (daily weather, district retail) follow under their own divider */}
                {[...varsOf(t.key).filter((x) => x.dataset !== 'gu_daily'), ...varsOf(t.key).filter((x) => x.dataset === 'gu_daily')]
                  .map((x, i, list) => {
                  const on = selection.includes(x.key);
                  const firstDistrictOnly = x.dataset === 'gu_daily' && (i === 0 || list[i - 1].dataset !== 'gu_daily');
                  // a third link lets the first one go
                  const replaces = !on && selection.length >= MAX_SELECTED ? VAR_BY_KEY[selection[0]]?.short : null;
                  return (
                    <Fragment key={x.key}>
                    {firstDistrictOnly && <li className="dsub" aria-hidden>District only</li>}
                    <li className={`drow${on ? ' on' : ''}`}>
                      <label className="dpick" title="Show as this theme's headline">
                        <input type="radio" name={`lead-${t.key}`} checked={headline[t.key] === x.key}
                          onChange={() => setHeadline(t.key, x.key)} />
                        <span className="dname">{x.short}</span>
                      </label>
                      <InfoTip x={x} />
                      <button className={`dicon link${on ? ' on' : ''}`} aria-pressed={on}
                        aria-label={on ? 'Unlink from the map' : 'Link to the map'}
                        title={on ? 'Unlink from the map' : replaces ? `Link to the map (replaces ${replaces})` : 'Link to the map'}
                        onClick={() => onSelect(x.key)}>
                        <Link2 size={15} strokeWidth={1.75} />
                        {on && <span className="link-n">{selection.indexOf(x.key) + 1}</span>}
                      </button>
                    </li>
                    </Fragment>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
