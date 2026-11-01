import {useMemo, useState} from 'react';
import {isTemporal, topVarsOf, type Variable} from '../../data/catalog';
import type {Place, UhusData} from '../../data/uhus';
import {fmt} from '../focusValues';
import type {Grain} from '../layers';
import {focusTest, placeSeries} from '../scatter';
import type {DashCtx} from './Dashboard';

const MW = 300, MH = 230;
// one teal, more = lighter on the dark glass — apart from the warm / cool of up and down
const RAMP = ['#15272b', '#1b4850', '#24727c', '#3aa5ad', '#9fe0e2'];

// Small multiples, large: every variable of the first linked variable's theme outside a folder
// as a map of the same places, in fifths of its own values — a whole theme at a glance.
// Daily ones show the playing day. Hovering a place lights it in every map and gives its
// value under each; the focused place is outlined; clicking a map links that variable (🔗).
// Last in the grid, a whole row of it, the focused place's profile: where it sits among its peers.
export default function MiniMaps({ctx}: {ctx: DashCtx}) {
  const {data, vars, grain, datasets, filters, day, selection, places, focus, onSelect} = ctx;
  const [hover, setHover] = useState<string | null>(null);
  const theme = vars[0]?.theme ?? 'environment';
  // a folder head stands for its folder (a sector for its industries, RHSI for its SHAP)
  const themeVars = topVarsOf(theme);
  const paths = usePaths(data, grain);
  // kepler hands out new dataset objects on every filter step; the values only change with
  // the day or when a dataset arrives, so those are what the memo watches
  const datasetKeys = Object.keys(datasets || {}).join();
  const series = useMemo(() => placeSeries(datasets, themeVars, grain, filters),
    [theme, grain, datasetKeys, themeVars.some(isTemporal) ? day : 0]);   // eslint-disable-line react-hooks/exhaustive-deps

  // one layer of 400+ paths per variable, rebuilt only when its values change — the hover
  // and the focus are drawn over it, so neither redraws the maps
  const fills = useMemo(() => themeVars.map((_, i) => {
    const colourOf = fifths(series[i]);
    return <g>{paths.map(({code, d}) => <path key={code} data-c={code} d={d} style={{fill: colourOf(code)}} />)}</g>;
  }), [series, paths]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pathOf = useMemo(() => new Map(paths.map((p) => [p.code, p.d])), [paths]);
  const {test} = focusTest(focus, grain);
  const focused = places.filter(test).map((p) => p.code);
  const shown = hover ?? (focused.length === 1 ? focused[0] : null);
  const shownPlace = shown ? places.find((p) => p.code === shown) : undefined;
  return (
    <>
      <div className="mm-readout">{shownPlace
        ? <><b>{shownPlace.name}</b>{shownPlace.guName !== shownPlace.name ? ` · ${shownPlace.guName}` : ''}{hover ? '' : ' (outlined)'}</>
        : <>Hover a place — it lights up in every map.</>}</div>
      <div className="mm-grid" onMouseOver={(e) => { const c = (e.target as Element).getAttribute?.('data-c'); if (c) setHover(c); }}
        onMouseLeave={() => setHover(null)}>
        {themeVars.map((x, i) => {
          const on = selection.includes(x.key);
          const v = shown ? series[i]?.get(shown) : undefined;
          return (
            <button key={x.key} className={`mm${on ? ' on' : ''}`} onClick={() => onSelect(x.key)}
              title={on ? `${x.full} — linked` : `${x.full} — click to link`}>
              <svg viewBox={`0 0 ${MW} ${MH}`} aria-hidden>
                {fills[i]}
                {focused.map((c) => <path key={c} className="mm-focus" d={pathOf.get(c)} />)}
                {hover && !focused.includes(hover) && <path className="mm-hover" d={pathOf.get(hover)} />}
              </svg>
              <span className="mm-name"><span>{x.short}</span>{v != null && <b>{fmt(v)}</b>}</span>
            </button>
          );
        })}
        <Profile vars={themeVars} series={series} place={focused.length === 1 ? places.find((p) => p.code === focused[0]) : undefined} grain={grain} />
      </div>
      <div className="mm-ramp">low {RAMP.map((c) => <i key={c} style={{background: c}} />)} high
        <span> · fifths of the {places.length} {grain === 'dong' ? 'neighbourhoods' : 'districts'}, per map</span></div>
    </>
  );
}

// The focused place on each of the theme's variables — the last row of the maps' grid, all
// of its width: a dot along its peers from lowest to highest, the median in the middle, its value and
// its share from the top or the bottom. Rows of HTML, so the type keeps its size in a narrow cell.
function Profile({vars, series, place, grain}: {vars: Variable[]; series: Map<string, number>[]; place: Place | undefined; grain: Grain}) {
  if (!place) return <div className="mm-profile hint">Focus a {grain === 'dong' ? 'neighbourhood' : 'district'} to see its profile here.</div>;
  const rows = vars.map((v, i) => {
    const vals = [...(series[i]?.values() ?? [])], at = series[i]?.get(place.code);
    if (at == null || vals.length < 2) return null;
    const p = vals.filter((u) => u < at).length / (vals.length - 1);
    return {v, at, p};
  }).filter((r): r is NonNullable<typeof r> => !!r);
  return (
    <div className="mm-profile">
      <div className="mm-prof-title">{place.name} — profile</div>
      <div className="mm-prof-row scale"><span /><span className="mm-prof-scale"><span>low</span><span>median</span><span>high</span></span><span /><span /></div>
      {rows.map(({v, at, p}) => (
        <div key={v.key} className="mm-prof-row" title={`${v.full}: ${profileValue(v, at)}`}>
          <span className="mm-prof-name">{v.short}</span>
          <span className="mm-prof-track"><i className="mid" /><i className="dot" style={{left: `${p * 100}%`}} /></span>
          <span className="mm-prof-val">{profileValue(v, at)}</span>
          <span className="mm-prof-share">{p >= 0.5 ? `top ${Math.max(1, Math.round((1 - p) * 100))}%` : `bottom ${Math.max(1, Math.round(p * 100))}%`}</span>
        </div>
      ))}
    </div>
  );
}

// a value as people read it: shares in %, a logged price back in won, else the number and its unit
function profileValue(v: Variable, x: number) {
  if (v.unit === 'ratio') return `${(x * 100).toFixed(0)}%`;
  if (v.unit.startsWith('log KRW')) return `₩${(Math.exp(x) / 1e6).toFixed(1)}M/m²`;
  return `${fmt(x)}${v.unit.startsWith('per ') ? `/${v.unit.slice(4)}` : ` ${v.unit}`}`;
}

// Fifths of a variable's values, lowest darkest.
function fifths(values: Map<string, number> | undefined) {
  const vals = [...(values?.values() ?? [])].sort((a, b) => a - b);
  if (!vals.length) return () => 'rgba(255,255,255,0.06)';
  const cuts = [1, 2, 3, 4].map((i) => vals[Math.min(vals.length - 1, Math.floor((i / 5) * vals.length))]);
  return (code: string) => {
    const v = values!.get(code);
    if (v == null) return 'rgba(255,255,255,0.06)';
    let k = 0;
    while (k < cuts.length && v >= cuts[k]) k++;
    return RAMP[k];
  };
}

// SVG paths of the dong or district polygons, once per grain, in a plain equirectangular
// projection squeezed by cos(latitude) — at Seoul's size that is close enough.
function usePaths(data: UhusData, grain: Grain) {
  return useMemo((): {code: string; d: string}[] => {
    const src: any = grain === 'dong' ? data.dong : data.gu;
    const gi = src.fields.findIndex((f: any) => f.name === '_geojson');
    const ki = src.fields.findIndex((f: any) => f.name === (grain === 'dong' ? 'dong_code' : 'gu_code'));
    const bounds = data.gus.map((g) => g.bounds);
    const [x0, y0, x1, y1] = [Math.min(...bounds.map((b) => b[0])), Math.min(...bounds.map((b) => b[1])),
      Math.max(...bounds.map((b) => b[2])), Math.max(...bounds.map((b) => b[3]))];
    const kx = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
    const s = Math.min((MW - 8) / ((x1 - x0) * kx), (MH - 8) / (y1 - y0));
    const ox = (MW - (x1 - x0) * kx * s) / 2, oy = (MH - (y1 - y0) * s) / 2;
    const pt = ([lng, lat]: number[]) => `${(ox + (lng - x0) * kx * s).toFixed(1)},${(oy + (y1 - lat) * s).toFixed(1)}`;
    const ring = (r: number[][]) => `M${r.map(pt).join('L')}Z`;
    return src.rows.map((row: any[]) => {
      const g = row[gi]?.geometry;
      const polys: number[][][][] = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
      return {code: String(row[ki]), d: polys.map((p) => p.map(ring).join('')).join('')};
    });
  }, [data, grain]);
}
