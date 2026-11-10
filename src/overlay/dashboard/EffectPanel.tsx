import {useMemo} from 'react';
import {SHAP_GROUPS, VAR_BY_KEY, type Variable} from '../../data/catalog';
import {fmt} from '../focusValues';
import {niceTicks, scaleOf} from '../scatter';
import {profileValue} from './MiniMaps';
import {mean, signed, useColumnWidth} from './SalesPanel';
import {readDongs} from './ShapPanel';
import type {DashCtx} from './Dashboard';

// What one of the model's inputs does to heat sensitivity. When a people, urban-form, mobility
// or sales-mix input leads the selection (one of the 25 the UHUS model learns RHSI from), the
// wide panel shows it twice. Left, SHAP's own dependence plot (shap.plots.scatter): a dot per
// neighbourhood at its value and its SHAP contribution — how far the input pushes its RHSI —
// with the mean of each tenth of the range drawn through them. Right, without the model: the
// neighbourhoods in fifths by the input, and the real mean RHSI of each fifth. The focused
// place is ringed white (a district: its neighbourhoods lit); clicking a dot focuses it.
// Mockup: mockups/wide-panel-options.html (B).
const H = 250, PAD = {l: 46, r: 12, t: 18, b: 36}, GAP = 24;
export const isInputKey = (key: string) => SHAP_GROUPS.some((g) => g.inputs.includes(key));

const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
// an axis value as people read it: shares in %, a logged price in won, else the number
export const tickOf = (v: Variable, x: number) => (v.unit === 'ratio' ? `${Math.round(x * 100)}%`
  : v.unit.startsWith('log KRW') ? `₩${(Math.exp(x) / 1e6).toFixed(1)}M` : fmt(x));

export default function EffectPanel({ctx, inputKey: key}: {ctx: DashCtx; inputKey: string}) {
  const {datasets, focus, onPick} = ctx;
  const v = VAR_BY_KEY[key];
  const [W, measure] = useColumnWidth();
  const datasetKeys = Object.keys(datasets || {}).join();
  const table = useMemo(() => readDongs(datasets), [datasetKeys]);   // eslint-disable-line react-hooks/exhaustive-deps

  const model = useMemo(() => {
    if (!table) return null;
    const xs = table.col(key), ss = table.col(`shap_${key}`), rh = table.col('RHSI_retail');
    const ids = xs.map((_, i) => i).filter((i) => Number.isFinite(xs[i]) && Number.isFinite(ss[i]));
    if (ids.length < 10) return null;
    // the scatter's own scale, 0–1 here: the 2nd–98th percentile, the few beyond on its
    // edges, a square root when the values are skewed
    const sx = scaleOf(ids.map((i) => xs[i]), 0, 1);
    const sv = ids.map((i) => ss[i]), slo = Math.min(...sv), shi = Math.max(...sv), pad = (shi - slo) * 0.08 || 0.01;
    // the mean contribution of each tenth of the axis, where at least five places fall
    const line: [number, number][] = [];
    for (let k = 0; k < 10; k++) {
      const inBin = ids.filter((i) => Math.min(9, Math.floor(sx.px(xs[i]) * 10)) === k);
      if (inBin.length >= 5) line.push([(k + 0.5) / 10, mean(inBin.map((i) => ss[i]))]);
    }
    // fifths by the input, each with the real mean RHSI of its places
    const order = ids.filter((i) => Number.isFinite(rh[i])).sort((a, b) => xs[a] - xs[b]);
    const fifths = [0, 1, 2, 3, 4].map((k) => order.slice(Math.round((k * order.length) / 5), Math.round(((k + 1) * order.length) / 5)))
      .map((f) => ({ids: f, rhsi: mean(f.map((i) => rh[i])), from: xs[f[0]], to: xs[f[f.length - 1]]}));
    return {xs, ss, ids, sx, ylo: slo - pad, yhi: shi + pad, line, fifths};
  }, [table, key]);

  // the focused place's neighbourhoods: its own, a district's, none for Seoul
  const members = useMemo(() => {
    if (!table || focus.level === 'seoul') return [];
    if (focus.level === 'dong') return [table.codes.indexOf(focus.dong.code)].filter((i) => i >= 0);
    return table.gus.map((g, i) => (g === focus.gu.code ? i : -1)).filter((i) => i >= 0);
  }, [table, focus]);

  const two = W >= 620, PW = two ? (W - GAP) / 2 : W;
  const dots = useMemo(() => {
    if (!model || !table) return null;
    const y = lin(model.ylo, model.yhi, H - PAD.b, PAD.t), cx = (u: number) => PAD.l + model.sx.px(u) * (PW - PAD.l - PAD.r);
    return model.ids.map((i) => (
      <circle key={i} className="fx-dot" cx={cx(model.xs[i])} cy={y(model.ss[i])} r={2.4} onClick={() => onPick('dong', table.codes[i])}>
        <title>{`${table.names[i]} · ${profileValue(v, model.xs[i])} · SHAP ${signed(model.ss[i])}`}</title>
      </circle>
    ));
  }, [model, table, PW]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!v) return null;
  if (!table) return <p className="dash-empty">Loading the neighborhoods…</p>;
  if (!model) return <p className="dash-empty">No model values for {v.short}.</p>;
  const y = lin(model.ylo, model.yhi, H - PAD.b, PAD.t), at = (p: number) => PAD.l + p * (PW - PAD.l - PAD.r);
  const cx = (u: number) => at(model.sx.px(u));
  // (a place the model has no value for has no dot of its own: no value for one of the two axes)
  const drawn = members.filter((i) => Number.isFinite(model.xs[i]) && Number.isFinite(model.ss[i]));
  const here = members.length ? mean(members.map((i) => model.xs[i]).filter(Number.isFinite)) : NaN;
  const pushHere = members.length ? mean(members.map((i) => model.ss[i]).filter(Number.isFinite)) : NaN;
  const sorted = model.ids.map((i) => model.xs[i]).sort((a, b) => a - b);
  const share = Number.isFinite(here) ? sorted.filter((u) => u < here).length / (sorted.length - 1) : NaN;
  const fB = Number.isFinite(here) ? model.fifths.findIndex((f) => here <= f.to) : -1;
  const lowF = model.fifths[0], highF = model.fifths[4];
  const place = focus.level === 'dong' ? focus.dong.name : focus.level === 'gu' ? focus.gu.name : null;

  // right: the fifths, bars from zero, tinted by the sign of their RHSI (falling sales cool)
  const rs = model.fifths.map((f) => f.rhsi);
  const rlo = Math.min(0, ...rs) * 1.25, rhi = Math.max(0, ...rs) * 1.25 || 0.01;
  const ry = lin(rlo, rhi, H - PAD.b - 4, PAD.t + 10), bw = (PW - PAD.l - PAD.r) / 5;
  const names = ['lowest fifth', '', 'middle', '', 'highest fifth'];
  return (
    <div className="fx" ref={measure}>
      <p className="shap-sum">
        RHSI is <b>{highF.rhsi < lowF.rhsi ? 'lower' : 'higher'}</b> where {v.short} is highest ({signed(highF.rhsi)}) than where it is
        lowest ({signed(lowF.rhsi)}) — {highF.rhsi < lowF.rhsi ? 'there, sales fall more in the heat' : 'there, sales hold up better in the heat'}.
        {place && Number.isFinite(here) && <> {place}: {profileValue(v, here)}, {share >= 0.5 ? `top ${Math.max(1, Math.round((1 - share) * 100))}%`
          : `bottom ${Math.max(1, Math.round(share * 100))}%`}; the model reads it as {signed(pushHere)} on its RHSI.</>}
      </p>
      <div className={`fx-two${two ? '' : ' one'}`}>
        <div>
          <div className="fx-head">Each neighborhood: its value, and how much it pushes RHSI</div>
          <svg className="sp-svg" viewBox={`0 0 ${PW} ${H}`} width={PW} height={H} role="img" aria-label={`SHAP dependence plot of ${v.short}`}>
            <g className="gc-ticks">
              {niceTicks(model.ylo, model.yhi, false, 4).map((t) => (
                <g key={`y${t}`}><line className={t === 0 ? 'fx-zero' : ''} x1={PAD.l} x2={PW - PAD.r} y1={y(t)} y2={y(t)} />
                  <text className="gc-tick" x={PAD.l - 6} y={y(t) + 3} textAnchor="end">{t === 0 ? '0' : signed(t, 2)}</text></g>
              ))}
              {niceTicks(model.sx.lo, model.sx.hi, model.sx.sqrt, 4).map((t) => (
                <text key={`x${t}`} className="gc-tick" x={cx(t)} y={H - PAD.b + 14} textAnchor="middle">{tickOf(v, t)}</text>
              ))}
            </g>
            {dots}
            {members.length > 1 && drawn.map((i) => <circle key={`m${i}`} className="fx-dot on" cx={cx(model.xs[i])} cy={y(model.ss[i])} r={2.8} />)}
            <polyline className="fx-mean" points={model.line.map(([a, b]) => `${at(a)},${y(b)}`).join(' ')} />
            {members.length === 1 && drawn.length === 1 && <circle className="fx-ring" cx={cx(model.xs[drawn[0]])} cy={y(model.ss[drawn[0]])} r={5.5} />}
            <text className="gc-axis" x={PAD.l} y={PAD.t - 6}>↑ SHAP: its push on RHSI (log-ratio)</text>
            <text className="gc-axis" x={PW - PAD.r} y={H - 4} textAnchor="end">{v.short}{v.unit === 'ratio' ? '' : ` (${v.unit})`}{model.sx.sqrt ? ' (√ scale)' : ''} →</text>
          </svg>
        </div>
        <div>
          <div className="fx-head">Real RHSI, the neighborhoods in fifths by {v.short}</div>
          <svg className="sp-svg" viewBox={`0 0 ${PW} ${H}`} width={PW} height={H} role="img" aria-label={`Mean RHSI by fifths of ${v.short}`}>
            <line className="fx-zero" x1={PAD.l} x2={PW - PAD.r} y1={ry(0)} y2={ry(0)} />
            <text className="gc-tick" x={PAD.l - 6} y={ry(0) + 3} textAnchor="end">0</text>
            {model.fifths.map((f, k) => {
              const c = PAD.l + bw * k + bw / 2, top = Math.min(ry(0), ry(f.rhsi)), h = Math.max(1, Math.abs(ry(f.rhsi) - ry(0)));
              return (
                <g key={k}>
                  <rect className={`fx-bar ${f.rhsi < 0 ? 'down' : 'up'}${k === fB ? ' on' : ''}`} x={c - bw * 0.3} y={top} width={bw * 0.6} height={h} rx={3}>
                    <title>{`${profileValue(v, f.from)}–${profileValue(v, f.to)} · ${f.ids.length} neighborhoods · mean RHSI ${signed(f.rhsi)}`}</title>
                  </rect>
                  <text className="fx-val" x={c} y={f.rhsi < 0 ? top + h + 12 : top - 4} textAnchor="middle">{signed(f.rhsi)}</text>
                  <text className="gc-tick" x={c} y={H - PAD.b + 14} textAnchor="middle">{tickOf(v, f.from)}–{tickOf(v, f.to)}</text>
                  <text className="gc-tick" x={c} y={H - PAD.b + 26} textAnchor="middle">{names[k]}</text>
                  {k === fB && <text className="fx-val" x={c} y={PAD.t} textAnchor="middle">▼ {focus.level === 'gu' ? 'its mean' : 'here'}</text>}
                </g>
              );
            })}
            <text className="gc-axis" x={PAD.l} y={PAD.t - 6}>↑ mean RHSI (log-ratio)</text>
          </svg>
        </div>
      </div>
      <div className="shap-legend">
        <span><i className="fx-key dot" />a neighborhood</span>
        <span><i className="fx-key line" />mean of each tenth of the axis</span>
        <span>below 0: the input lowers RHSI — sales fall more on heat days</span>
        <span><i className="fx-key bar down" /><i className="fx-key bar up" />mean RHSI below / above 0</span>
      </div>
    </div>
  );
}
