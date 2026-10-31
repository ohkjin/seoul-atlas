import {Fragment, useEffect, useRef, useState} from 'react';
import {useDispatch} from 'react-redux';
import {ChevronDown, ChevronRight, Link2, LoaderCircle, Map as MapIcon, X} from 'lucide-react';
import {THEMES, VAR_BY_KEY, childrenOf, topVarsOf, type ThemeKey, type Variable} from '../data/catalog';
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
  onSelect: (key: string, as: 'main' | 'link') => void;
  loading?: string[];   // industries whose sales are loading before they go on the map
};

// The bottom drawer. Closed, it is six floating theme cards. Open, a sheet rises from
// the bottom edge carrying the cards on its top edge, and each theme's variable list
// sits directly under its own card. While open it may cover anything else on screen.
// Some variables head a folder of related ones (a sector's sales and its industries, RHSI
// and its SHAP contributions); folders start open, and fold with their chevron.
// A row's radio picks its theme card's headline. At its right, the map button puts it on the
// map as the main — one for the whole drawer, never none — and 🔗 links it to that main; the
// links show on a hovered row, and on every row once a main is picked, as the next thing to do.
export default function Drawer({focus, grain, headline, setHeadline, selection, onSelect, loading}: Props) {
  const dispatch = useDispatch();
  const kepler = useKepler();
  const visState = kepler?.visState;
  const datasets = visState?.datasets || {};
  const filters = visState?.filters || [];

  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [linking, setLinking] = useState(false);   // a main was picked: the links come up
  const [folded, setFolded] = useState<Set<string>>(() => new Set());   // folder heads folded shut
  const toggleFold = (key: string) => setFolded((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const timer = useRef<number | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);
  const downAt = useRef<{x: number; y: number} | null>(null);

  const close = () => { setOpen(false); setPinned(false); setLinking(false); };
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

  // one variable's row: headline pick, name, its folder's chevron (if it heads one), ⓘ, main, link
  const main = VAR_BY_KEY[selection[0]]?.short;
  const row = (theme: ThemeKey, x: Variable, fold: React.ReactNode, child = false) => {
    const isMain = selection[0] === x.key;
    const linked = selection[1] === x.key;
    const busy = !!loading?.includes(x.key);
    const replaces = !linked && selection.length >= MAX_SELECTED ? VAR_BY_KEY[selection[1]]?.short : null;
    const tip = busy ? 'Loading its sales…' : linked ? `Unlink from ${main}`
      : replaces ? `Link to ${main} (replaces ${replaces})` : `Link to ${main}`;
    return (
      <li className={`drow${isMain || linked ? ' on' : ''}${isMain ? ' main' : ''}${child ? ' child' : ''}`}>
        <label className="dpick" title="Show as this theme's headline">
          <input type="radio" name={`lead-${theme}`} checked={headline[theme] === x.key}
            onChange={() => setHeadline(theme, x.key)} />
          <span className="dname">{x.short}</span>
        </label>
        {fold}
        <InfoTip x={x} />
        <button className={`dicon map${isMain ? ' on' : ''}`} aria-pressed={isMain} disabled={busy}
          aria-label={isMain ? 'On the map' : 'Show on the map'} title={isMain ? 'On the map' : 'Show on the map'}
          onClick={() => { if (!isMain) { onSelect(x.key, 'main'); setLinking(true); } }}>
          <MapIcon size={15} strokeWidth={1.75} />
        </button>
        {/* the main has nothing to link to: its place is kept, empty */}
        <button className={`dicon link${linked ? ' on' : ''}${busy ? ' busy' : ''}${isMain ? ' self' : ''}`} aria-pressed={linked}
          disabled={busy || isMain} aria-label={tip} title={tip} onClick={() => onSelect(x.key, 'link')}>
          {busy ? <LoaderCircle size={15} strokeWidth={1.75} /> : <Link2 size={15} strokeWidth={1.75} />}
        </button>
      </li>
    );
  };

  return (
    <div className={`drawer${open ? ' open' : ''}${linking ? ' linking' : ''}`} ref={root} onMouseEnter={enter} onMouseLeave={leave}>
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
                {[...topVarsOf(t.key).filter((x) => x.dataset !== 'gu_daily'), ...topVarsOf(t.key).filter((x) => x.dataset === 'gu_daily')]
                  .map((x, i, list) => {
                  const kids = childrenOf(x.key);
                  const shut = folded.has(x.key);
                  const firstDistrictOnly = x.dataset === 'gu_daily' && (i === 0 || list[i - 1].dataset !== 'gu_daily');
                  return (
                    <Fragment key={x.key}>
                    {firstDistrictOnly && <li className="dsub" aria-hidden>District only</li>}
                    {row(t.key, x, kids.length ? (
                      <button className="dfold" aria-expanded={!shut} title={shut ? `Show its ${kids.length}` : 'Fold'}
                        onClick={() => toggleFold(x.key)}>
                        {shut ? <ChevronRight size={13} strokeWidth={2} /> : <ChevronDown size={13} strokeWidth={2} />}
                        <span className="dfold-n">{kids.length}</span>
                      </button>
                    ) : null)}
                    {!shut && kids.map((k) => <Fragment key={k.key}>{row(t.key, k, null, true)}</Fragment>)}
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
