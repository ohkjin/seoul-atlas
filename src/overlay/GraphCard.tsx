import {useMemo, useState} from 'react';
import {VAR_BY_KEY, type Variable} from '../data/catalog';
import type {Place, UhusData} from '../data/uhus';
import type {Focus} from './Overlay';
import {useKepler} from './useKepler';
import {fmt} from './focusValues';
import {selectionEntries, type Grain} from './layers';
import {dailyColoursOf, isBivariateLayer} from './pair';
import {Scatter, colouring, focusTest, layoutScatter, placeSeries, useStableCallback, type Box} from './scatter';

type Props = {data: UhusData; focus: Focus; selection: string[]; linked: boolean; grain: Grain; is3d: boolean; playing: boolean;
  onPick: (level: 'dong' | 'gu', code: string) => void; onOpenDashboard: () => void};

// The 2D graph: one scatter that gains an axis with the selection. One variable — every
// place on one axis (a beeswarm), so the spread and where the focused place sits in it
// read at a glance. Two linked variables — the same dots spread up the second axis: B
// across, A up, coloured like the map (the bivariate grid when the map shows it). Daily
// variables are read on the playing day, so the dots move as time plays. A dot is a dong
// (or a district under Gu detail); hovering names it, clicking focuses it. ↗ opens the
// dashboard with this and more, larger.
export default function GraphCard({data, focus, selection, linked, grain, is3d, playing, onPick, onOpenDashboard}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const kepler = useKepler();
  const visState = kepler?.visState;
  const filters = visState?.filters || [];
  const vars = useMemo(() => selection.map((k) => VAR_BY_KEY[k]).filter(Boolean) as Variable[], [selection.join()]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [a, b] = vars;
  const places: Place[] = grain === 'dong' ? data.dongs : data.gus;
  const box: Box = useMemo(() => ({W: 288, H: 132, pad: {l: 4, r: 4, t: 8, b: 14}, r: grain === 'dong' ? 2.3 : 4.5}), [grain]);
  const pick = useStableCallback(onPick);

  // the playing day, not the window's exact position: the window slides, the values only
  // change at midnight
  const day = Math.ceil((filters.find((f: any) => f.id === 'time')?.value?.[0] ?? 0) / 86400000);
  const datasets = visState?.datasets;
  // kepler hands out new dataset objects on every filter step; the values only change with
  // the day or when a dataset arrives, so those are what the memo watches
  const datasetKeys = Object.keys(datasets || {}).join();
  const series = useMemo(() => placeSeries(datasets, vars, grain, filters),
    [selection.join(), grain, datasetKeys, day]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the map's colouring, so a dot and its place share a colour
  const entries = visState ? selectionEntries(visState, selection, linked, grain, is3d) : [];
  const layer = entries[0]?.layer;
  const bivariate = vars.length === 2 && isBivariateLayer(layer);
  // the daily pair's colours change with the day; the dots take them place by place
  const byCode = dailyColoursOf(layer);
  const codeKey = byCode ? [...byCode.values()].join() : '';
  const ramp: string[] | null = vars.length === 1 || entries[0]?.pairPart ? layer?.config.visConfig?.colorRange?.colors ?? null : null;

  const plot = useMemo(() => layoutScatter(places, series, vars.length, box),
    [places, series, vars.length, grain]);   // eslint-disable-line react-hooks/exhaustive-deps
  const colourOf = useMemo(() => colouring(series, vars.length, bivariate, ramp, byCode),
    [series, vars.length, bivariate, ramp?.join(), codeKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const shown = hover ?? focusTest(focus, grain).code;
  const shownPlace = shown ? places.find((p) => p.code === shown) : null;

  // the variables are named on the axes; the title only says what kind of view this is
  const title = !a ? '2D graph' : b ? 'Relationship' : 'Spread';

  return (
    <section className={`graph-card glass${collapsed ? ' collapsed' : ''}`}>
      <div className="card-head">
        <span className="card-title" title={title}>{title}</span>
        <button className="icon-btn sm" title={collapsed ? 'Expand' : 'Collapse'} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '+' : '−'}
        </button>
        <button className="icon-btn sm" title="Open the dashboard" aria-label="Open the dashboard" onClick={onOpenDashboard}>↗</button>
      </div>
      {!collapsed && (!a ? (
        <div className="graph-placeholder">Link a variable below to see how its places spread</div>
      ) : plot.n === 0 ? (
        <div className="graph-placeholder">Loading the {grain === 'dong' ? 'neighbourhood' : 'district'} values…</div>
      ) : (
        <>
          <Scatter places={places} series={series} vars={vars} box={box} plot={plot} colourOf={colourOf} showCuts={bivariate}
            focus={focus} grain={grain} playing={playing} onHover={setHover} onPick={pick} />
          <div className="gc-caption">
            {shownPlace ? (
              <>
                <span className="gc-name">{shownPlace.name}</span>
                {vars.map((x, i) => {
                  const v = series[i].get(shownPlace.code);
                  return <span key={x.key}>{fmt(v ?? null)}{x.unit !== 'ratio' ? ` ${x.unit}` : ''}</span>;
                })}
                {!b && plot.rank.get(shownPlace.code) != null && (
                  <span className="gc-rank">top {Math.max(1, Math.round((plot.rank.get(shownPlace.code)! / plot.n) * 100))}%</span>
                )}
              </>
            ) : (
              <span className="gc-hint">{plot.n} {grain === 'dong' ? 'neighbourhoods' : 'districts'} · hover a dot, click to focus</span>
            )}
          </div>
        </>
      ))}
    </section>
  );
}
