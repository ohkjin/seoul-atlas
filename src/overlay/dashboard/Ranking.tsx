import {useMemo} from 'react';
import {fmt} from '../focusValues';
import {focusTest} from '../scatter';
import type {DashCtx} from './Dashboard';

const N = 10;

// The ten highest and ten lowest places for the first linked variable (on the playing
// day if it is daily). A row is a place; clicking it focuses the map there. A focused
// place outside both lists is pinned beneath them with its rank, so it is never lost.
export default function Ranking({ctx}: {ctx: DashCtx}) {
  const {vars, series, places, focus, grain, onPick} = ctx;
  const a = vars[0];
  const values = series[0];
  const rows = useMemo(() => (values ? places.filter((p) => values.has(p.code)).map((p) => ({p, v: values.get(p.code)!}))
    .sort((x, y) => y.v - x.v) : []), [places, values]);
  if (!a) return <p className="dash-empty">Link a variable to rank its places.</p>;
  if (!rows.length) return <p className="dash-empty">Loading the values…</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.v))) || 1;
  const {test} = focusTest(focus, grain);
  // the unit once, in the column heads, so a row's value never wraps
  const unit = a.unit !== 'ratio' ? a.unit : '';
  const row = ({p, v}: (typeof rows)[number], n: number, extra = '') => (
    <button key={p.code} className={`rk-row${test(p) ? ' on' : ''}${extra}`} onClick={() => onPick(grain, p.code)}
      title={`${p.name}${p.guName !== p.name ? ` · ${p.guName}` : ''}`}>
      <span className="rk-n">{n}</span>
      <span className="rk-name">{p.name}</span>
      <span className="rk-bar"><i style={{width: `${(Math.abs(v) / max) * 100}%`}} /></span>
      <span className="rk-val">{fmt(v)}</span>
    </button>
  );
  const list = (items: typeof rows, rankOf: (i: number) => number) => (
    <div className="rk-list">{items.map((r, i) => row(r, rankOf(i)))}</div>
  );
  // the focused place, when neither list shows it: a neighbourhood or district at this
  // grain by its rank; a district under Dong detail by how many of its dongs made the lists
  const at = rows.findIndex((r) => test(r.p));
  const shown = (i: number) => i < N || i >= rows.length - N;
  const pinned = focus.level !== 'seoul' && at >= 0 && !(grain === 'dong' && focus.level === 'gu') && !shown(at) ? rows[at] : null;
  const ofGu = grain === 'dong' && focus.level === 'gu'
    ? {top: rows.slice(0, N).filter((r) => test(r.p)).length, bottom: rows.slice(-N).filter((r) => test(r.p)).length} : null;
  return (
    <>
      <div className="rk">
        <div><div className="rk-head">Highest{unit && <span> · {unit}</span>}</div>{list(rows.slice(0, N), (i) => i + 1)}</div>
        <div><div className="rk-head">Lowest{unit && <span> · {unit}</span>}</div>{list(rows.slice(-N).reverse(), (i) => rows.length - i)}</div>
      </div>
      {pinned && (
        <div className="rk-pin">{row(pinned, at + 1, ' pin')}</div>
      )}
      {ofGu && focus.level === 'gu' && (
        <p className="rk-pin-label rk-pin">{focus.gu.name}: {ofGu.top} of its dongs in the top {N}, {ofGu.bottom} in the bottom {N}.</p>
      )}
    </>
  );
}
