import {useMemo} from 'react';
import {VAR_BY_KEY} from '../../data/catalog';
import {niceTicks} from '../scatter';
import {tickOf} from './EffectPanel';
import {profileValue} from './MiniMaps';
import {useColumnWidth} from './SalesPanel';
import {readDongs} from './ShapPanel';
import type {DashCtx} from './Dashboard';

// By district: for a variable that is neither daily nor one of the model's inputs (heat days,
// mild days), the wide panel lays every neighbourhood out by its district — a row per
// district, highest median first, a dot per neighbourhood, the district's median a white tick,
// Seoul's median dashed. The focused district's row is lit and a focused neighbourhood is the
// white dot. What the Ranking cannot show: which districts, and how far apart their own
// neighbourhoods are. Clicking a dot focuses the neighbourhood, a name the district.
// Mockup: mockups/wide-panel-options.html (C).
const RH = 16, LW = 104, RW = 46, AXIS = 34;

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };

export default function DistrictPanel({ctx, varKey: key}: {ctx: DashCtx; varKey: string}) {
  const {data, datasets, focus, onPick} = ctx;
  const v = VAR_BY_KEY[key];
  const [W, measure] = useColumnWidth();
  const datasetKeys = Object.keys(datasets || {}).join();
  const table = useMemo(() => readDongs(datasets), [datasetKeys]);   // eslint-disable-line react-hooks/exhaustive-deps

  const model = useMemo(() => {
    if (!table) return null;
    const xs = table.col(key), byGu = new Map<string, number[]>();
    xs.forEach((u, i) => { if (Number.isFinite(u)) (byGu.get(table.gus[i]) ?? byGu.set(table.gus[i], []).get(table.gus[i])!).push(i); });
    const names = new Map(data.gus.map((g) => [g.code, g.name]));
    const rows = [...byGu].map(([gu, ids]) => ({gu, name: names.get(gu) ?? gu, ids, med: median(ids.map((i) => xs[i])),
      lo: Math.min(...ids.map((i) => xs[i])), hi: Math.max(...ids.map((i) => xs[i]))})).sort((a, b) => b.med - a.med);
    const all = xs.filter(Number.isFinite);
    const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.03 || 1;
    return {xs, rows, lo: lo - pad, hi: hi + pad, seoul: median(all)};
  }, [table, key, data.gus]);

  const focusGu = focus.level === 'gu' ? focus.gu.code : focus.level === 'dong' ? focus.dong.guCode : null;
  const focusAt = focus.level === 'dong' && table ? table.codes.indexOf(focus.dong.code) : -1;
  const x = (u: number) => (model ? LW + ((u - model.lo) / (model.hi - model.lo || 1)) * (W - LW - RW) : 0);
  // the 400+ dots, drawn once per variable and width; the focus is drawn over them
  const dots = useMemo(() => model && table && model.rows.map((r, k) => (
    <g key={r.gu}>{r.ids.map((i, j) => (
      <circle key={i} className={`dc-dot${r.gu === focusGu ? ' on' : ''}`} cx={x(model.xs[i])} cy={k * RH + RH / 2 + ((j * 37) % 7) - 3} r={2.4}
        onClick={() => onPick('dong', table.codes[i])}><title>{`${table.names[i]} · ${profileValue(v, model.xs[i])}`}</title></circle>
    ))}</g>
  )), [model, table, W, focusGu]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!v) return null;
  if (!model) return <p className="dash-empty">Loading the neighborhoods…</p>;
  const H = model.rows.length * RH + AXIS;
  const bottom = model.rows.length * RH;
  const gu = model.rows.find((r) => r.gu === focusGu);
  return (
    <div className="dc" ref={measure}>
      <p className="shap-sum">Districts by their median{gu ? <> · <b>{gu.name}</b> lit</> : ''}
        {focusAt >= 0 && Number.isFinite(model.xs[focusAt]) ? <> · <b>{table!.names[focusAt]}</b> the white dot ({profileValue(v, model.xs[focusAt])})</> : ''}</p>
      <svg className="sp-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${v.short} of every neighborhood, by district`}>
        <g className="gc-ticks">
          {niceTicks(model.lo, model.hi, false, 6).map((t) => (
            <g key={t}><line x1={x(t)} x2={x(t)} y1={0} y2={bottom} />
              <text className="gc-tick" x={x(t)} y={bottom + 13} textAnchor="middle">{tickOf(v, t)}</text></g>
          ))}
        </g>
        {gu && <rect className="dc-lit" x={0} y={model.rows.indexOf(gu) * RH} width={W} height={RH} rx={4} />}
        <line className="dc-seoul" x1={x(model.seoul)} x2={x(model.seoul)} y1={0} y2={bottom} />
        <text className="gc-tick" x={x(model.seoul) + 4} y={bottom + 27}>Seoul median {profileValue(v, model.seoul)}</text>
        {model.rows.map((r, k) => {
          const yc = k * RH + RH / 2;
          return (
            <g key={r.gu}>
              <text className={`dc-name${r.gu === focusGu ? ' on' : ''}`} x={LW - 10} y={yc + 4} textAnchor="end" onClick={() => onPick('gu', r.gu)}>{r.name}</text>
              <line className="dc-range" x1={x(r.lo)} x2={x(r.hi)} y1={yc} y2={yc} />
              <text className="gc-tick" x={W} y={yc + 3} textAnchor="end">{tickOf(v, r.med)}</text>
            </g>
          );
        })}
        {dots}
        {model.rows.map((r, k) => <line key={r.gu} className="dc-med" x1={x(r.med)} x2={x(r.med)} y1={k * RH + 2} y2={k * RH + RH - 2} />)}
        {focusAt >= 0 && Number.isFinite(model.xs[focusAt]) && gu && (
          <circle className="dc-focus" cx={x(model.xs[focusAt])} cy={model.rows.indexOf(gu) * RH + RH / 2} r={4.5} />
        )}
      </svg>
      <div className="shap-legend">
        <span><i className="fx-key dot" />a neighborhood</span>
        <span><i className="dc-key med" />district median</span>
        <span><i className="sp-dash seoul" />Seoul median</span>
        <span>right: the district's median</span>
      </div>
    </div>
  );
}
