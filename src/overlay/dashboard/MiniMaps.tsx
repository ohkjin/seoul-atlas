import {useMemo} from 'react';
import {dailyColorRange, isTemporal, paletteRange, varsOf, type Variable} from '../../data/catalog';
import type {UhusData} from '../../data/uhus';
import type {Grain} from '../layers';
import {placeSeries} from '../scatter';
import type {DashCtx} from './Dashboard';

const MW = 200, MH = 150;

// Small multiples: every variable of the first linked variable's theme as a little map of
// the same places, coloured by quantile in its map palette — a whole theme at a glance.
// Daily ones show the playing day. Clicking a map links that variable (🔗).
export default function MiniMaps({ctx}: {ctx: DashCtx}) {
  const {data, vars, grain, datasets, filters, day, selection, onSelect} = ctx;
  const theme = vars[0]?.theme ?? 'environment';
  const themeVars = varsOf(theme);
  const paths = usePaths(data, grain);
  // kepler hands out new dataset objects on every filter step; the values only change with
  // the day or when a dataset arrives, so those are what the memo watches
  const datasetKeys = Object.keys(datasets || {}).join();
  const series = useMemo(() => placeSeries(datasets, themeVars, grain, filters),
    [theme, grain, datasetKeys, themeVars.some(isTemporal) ? day : 0]);   // eslint-disable-line react-hooks/exhaustive-deps

  // one SVG per variable, rebuilt only when its values change: 400+ paths each, and
  // rebuilding them all on every store update stalled playback
  const maps = useMemo(() => themeVars.map((x, i) => {
    const colourOf = quantileColours(series[i], ramp(x));
    return (
      <svg viewBox={`0 0 ${MW} ${MH}`} aria-hidden>
        {paths.map(({code, d}) => <path key={code} d={d} style={{fill: colourOf(code)}} />)}
      </svg>
    );
  }), [series, paths]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mm-grid">
      {themeVars.map((x, i) => {
        const on = selection.includes(x.key);
        return (
          <button key={x.key} className={`mm${on ? ' on' : ''}`} onClick={() => onSelect(x.key)}
            title={on ? `${x.full} — linked` : `${x.full} — click to link`}>
            {maps[i]}
            <span className="mm-name">{x.short}</span>
          </button>
        );
      })}
    </div>
  );
}

const ramp = (x: Variable) => (isTemporal(x) ? dailyColorRange(x) ?? paletteRange('Global Warming') : paletteRange('Global Warming'))?.colors ?? [];

function quantileColours(values: Map<string, number>, colors: string[]) {
  const vals = [...values.values()].sort((a, b) => a - b);
  if (!vals.length || !colors.length) return () => 'rgba(255,255,255,0.06)';
  const cuts = colors.slice(1).map((_, i) => vals[Math.min(vals.length - 1, Math.floor(((i + 1) / colors.length) * vals.length))]);
  return (code: string) => {
    const v = values.get(code);
    if (v == null) return 'rgba(255,255,255,0.06)';
    let k = 0;
    while (k < cuts.length && v >= cuts[k]) k++;
    return colors[k];
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

