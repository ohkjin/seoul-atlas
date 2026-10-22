import {useEffect, useMemo, useRef, useState} from 'react';
import {MapPin, Search} from 'lucide-react';
import type {Place, UhusData} from '../data/uhus';
import {THEMES, VARIABLES} from '../data/catalog';

// The top bar's search: one field for a district, a neighbourhood or a variable. A place
// flies there (like a click on the map); a variable goes on the map (like the drawer's 🔗).
// "/" or Ctrl+K from anywhere puts the cursor in it.
type Hit = {kind: 'gu'; place: Place} | {kind: 'dong'; place: Place} | {kind: 'var'; key: string; name: string; sub: string};
type Props = {data: UhusData | null; selection: string[];
  onGu: (gu: Place) => void; onDong: (dong: Place) => void; onVariable: (key: string) => void};

const THEME_LABEL = Object.fromEntries(THEMES.map((t) => [t.key, t.label])) as Record<string, string>;
const norm = (s: string) => s.toLowerCase().replace(/[\s·-]/g, '');

// a name starting with the query ranks before one that only contains it
function rank(name: string, q: string) {
  const n = norm(name);
  return n.startsWith(q) ? 0 : n.includes(q) ? 1 : -1;
}
function best<T>(items: T[], name: (t: T) => string, q: string, max: number) {
  return items.map((t) => [t, rank(name(t), q)] as const).filter(([, r]) => r >= 0)
    .sort((a, b) => a[1] - b[1] || name(a[0]).localeCompare(name(b[0]))).slice(0, max).map(([t]) => t);
}

export default function SearchBox({data, selection, onGu, onDong, onVariable}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const hits = useMemo<Hit[]>(() => {
    const q = norm(text);
    if (!q || !data) return [];
    return [
      ...best(data.gus, (p) => p.name, q, 4).map((place) => ({kind: 'gu' as const, place})),
      ...best(data.dongs, (p) => p.name, q, 6).map((place) => ({kind: 'dong' as const, place})),
      ...best(VARIABLES, (x) => `${x.short} ${x.full}`, q, 5)
        .map((x) => ({kind: 'var' as const, key: x.key, name: x.short, sub: THEME_LABEL[x.theme] ?? x.theme}))
    ];
  }, [text, data]);
  useEffect(() => setActive(0), [text]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as Element)?.closest?.('input, textarea, select, [contenteditable]');
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const go = (h: Hit | undefined) => {
    if (!h) return;
    if (h.kind === 'gu') onGu(h.place);
    else if (h.kind === 'dong') onDong(h.place);
    else if (!selection.includes(h.key)) onVariable(h.key);
    setText('');
    setOpen(false);
    input.current?.blur();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') go(hits[active]);
    else if (e.key === 'Escape') { setText(''); setOpen(false); input.current?.blur(); }
  };

  const group = (h: Hit) => (h.kind === 'gu' ? 'Districts' : h.kind === 'dong' ? 'Neighbourhoods' : 'Variables');
  return (
    <div className={`search${open && text ? ' open' : ''}`} role="search">
      <Search size={16} strokeWidth={1.75} className="search-icon" aria-hidden />
      <input ref={input} value={text} placeholder="Search a district, neighbourhood or variable"
        aria-label="Search the atlas" aria-expanded={open && !!text} aria-controls="search-results"
        onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)} onKeyDown={onKey} />
      <kbd className="search-kbd" aria-hidden>/</kbd>
      {open && text && (
        <ul id="search-results" className="search-results" role="listbox"
          onMouseDown={(e) => e.preventDefault()}>   {/* keep focus in the field while a row is clicked */}
          {hits.length === 0 && <li className="sr-empty">Nothing in Seoul by that name</li>}
          {hits.map((h, i) => (
            <li key={h.kind === 'var' ? h.key : `${h.kind}${h.place.code}`} role="presentation">
              {(i === 0 || group(hits[i - 1]) !== group(h)) && <div className="sr-group">{group(h)}</div>}
              <button role="option" aria-selected={i === active} className={`sr-row${i === active ? ' on' : ''}`}
                onMouseEnter={() => setActive(i)} onClick={() => go(h)}>
                {h.kind !== 'var' && <MapPin size={14} strokeWidth={1.75} aria-hidden />}
                <span className="sr-name">{h.kind === 'var' ? h.name : h.place.name}</span>
                <span className="sr-sub">{h.kind === 'var' ? (selection.includes(h.key) ? 'on the map' : h.sub)
                  : h.kind === 'dong' ? h.place.guName : 'District'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
