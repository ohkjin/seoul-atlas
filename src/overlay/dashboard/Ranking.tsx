import {useMemo} from 'react';
import type {Place} from '../../data/uhus';
import {fmt} from '../focusValues';
import {focusTest} from '../scatter';
import type {DashCtx} from './Dashboard';

const N = 10;

// The ten highest and ten lowest places for the first linked variable (on the playing
// day if it is daily), under a strip of every place in order — grey, the focused one white.
// A row is a place; clicking it focuses the map there. A row's bar is tinted warm above,
// cool below (zero for a signed variable, the average otherwise), the focused one white. A
// focused place outside both lists is pinned beneath them with its rank, so it is never lost.
export default function Ranking({ctx}: {ctx: DashCtx}) {
  const {vars, series, places, focus, grain, onPick} = ctx;
  const a = vars[0];
  const values = series[0];
  const rows = useMemo(() => (values ? places.filter((p) => values.has(p.code)).map((p) => ({p, v: values.get(p.code)!}))
    .sort((x, y) => y.v - x.v) : []), [places, values]);
  if (!a) return <p className="dash-empty">Link a variable to rank its places.</p>;
  if (!rows.length) return <p className="dash-empty">Loading the values…</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.v))) || 1;
  const mid = a.signed ? 0 : rows.reduce((t, r) => t + r.v, 0) / rows.length;
  const {test} = focusTest(focus, grain);
  // the unit once, in the column heads, so a row's value never wraps
  const unit = a.unit !== 'ratio' ? a.unit : '';
  const row = ({p, v}: (typeof rows)[number], n: number, extra = '') => (
    <button key={p.code} className={`rk-row${test(p) ? ' on' : ''}${extra}`} onClick={() => onPick(grain, p.code)}
      title={`${p.name}${p.guName !== p.name ? ` · ${p.guName}` : ''}`}>
      <span className="rk-n">{n}</span>
      <span className="rk-name">{p.name}</span>
      <span className="rk-bar"><i className={v > mid ? 'up' : v < mid ? 'down' : ''} style={{width: `${(Math.abs(v) / max) * 100}%`}} /></span>
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
      <AllPlaces rows={rows} test={test} signed={!!a.signed} onPick={(code) => onPick(grain, code)} />
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

// Every place, highest to lowest, one thin bar each from zero (from the lowest value when
// none is negative), across the panel's width and a fixed height — the bars stretch, the
// words stay HTML so they keep their size. Grey, the zero line drawn plainly, the focused
// place white and named above its bar.
function AllPlaces({rows, test, signed, onPick}: {rows: {p: Place; v: number}[]; test: (p: Place) => boolean; signed: boolean;
  onPick: (code: string) => void}) {
  const n = rows.length, H = 100;
  const bars = useMemo(() => {
    const vs = rows.map((r) => r.v), hi = Math.max(...vs), lo = Math.min(...vs), fromZero = signed || lo < 0;
    const base = fromZero ? Math.min(0, lo) : lo - (hi - lo) * 0.05, top = fromZero ? Math.max(hi, 0) : hi;
    const y = (v: number) => H - ((v - base) / (top - base || 1)) * H;
    const y0 = y(fromZero ? 0 : base);
    return {y, y0, fromZero, els: rows.map((r, i) => (
      <rect key={r.p.code} className="rk-all" x={i + 0.1} width={0.8} y={Math.min(y0, y(r.v))}
        height={Math.max(0.8, Math.abs(y(r.v) - y0))} onClick={() => onPick(r.p.code)}><title>{`#${i + 1} ${r.p.name} · ${fmt(r.v)}`}</title></rect>
    ))};
  }, [rows, signed]);   // eslint-disable-line react-hooks/exhaustive-deps
  const at = rows.findIndex((r) => test(r.p));
  const share = at >= 0 ? (at + 0.5) / n : 0;
  return (
    <div className="rk-strip-box">
      {at >= 0 && (
        <div className="rk-strip-name" style={{left: `${share * 100}%`, transform: `translateX(${share > 0.7 ? '-100%' : share < 0.3 ? '0' : '-50%'})`}}>
          <b>{rows[at].p.name}</b> · #{at + 1} of {n} · {fmt(rows[at].v)}</div>
      )}
      <div className="rk-strip-plot">
        <svg className="rk-strip" viewBox={`0 0 ${n} ${H}`} preserveAspectRatio="none" role="img" aria-label="Every place, highest to lowest">
          {bars.els}
          <line className="rk-zero" x1={0} x2={n} y1={bars.y0} y2={bars.y0} />
          {at >= 0 && <rect className="rk-all on" x={at - 0.6} width={2.2} y={Math.min(bars.y0, bars.y(rows[at].v))}
            height={Math.max(1.5, Math.abs(bars.y(rows[at].v) - bars.y0))} />}
        </svg>
        {bars.fromZero && <span className="rk-zero-label" style={{top: `${bars.y0}%`}}>0</span>}
      </div>
      <div className="rk-strip-ends"><span>← highest</span><span>lowest →</span></div>
    </div>
  );
}
