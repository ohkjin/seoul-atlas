import {useMemo, useState} from 'react';
import type {Variable} from '../../data/catalog';
import type {Place} from '../../data/uhus';
import {fmt} from '../focusValues';
import {dailyColoursOf, isBivariateLayer} from '../pair';
import {Scatter, colouring, focusTest, layoutScatter, spearman, useStableCallback, type Box} from '../scatter';
import type {DashCtx} from './Dashboard';

// The 2D graph card's scatter, large: range ends on the axes, and for two variables
// Spearman's ρ — how strongly the two rank places alike.
export default function BigScatter({ctx}: {ctx: DashCtx}) {
  const {vars, places, series, grain, focus, playing, entries, onPick} = ctx;
  const [hover, setHover] = useState<string | null>(null);
  const [a, b] = vars;
  const box: Box = useMemo(() => ({W: 520, H: 270, pad: {l: 4, r: 4, t: 18, b: 16}, r: grain === 'dong' ? 3 : 6}), [grain]);
  const pick = useStableCallback(onPick);
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
  const rho = useMemo(() => (b ? spearman(series[0], series[1]) : null), [series, b]);

  if (!a) return <p className="dash-empty">Link a variable to see how its places spread.</p>;
  if (!plot.n) return <p className="dash-empty">Loading the values…</p>;
  const shown = hover ?? focusTest(focus, grain).code;
  const place: Place | undefined = shown ? places.find((p) => p.code === shown) : undefined;
  return (
    <>
      <Scatter places={places} series={series} vars={vars} box={box} plot={plot} colourOf={colourOf} showCuts={bivariate}
        focus={focus} grain={grain} playing={playing} ticks onHover={setHover} onPick={pick} />
      <div className="gc-caption">
        {place ? (
          <>
            <span className="gc-name">{place.name}</span>
            {vars.map((x: Variable, i) => <span key={x.key}>{fmt(series[i].get(place.code) ?? null)}{x.unit !== 'ratio' ? ` ${x.unit}` : ''}</span>)}
          </>
        ) : <span className="gc-hint">{plot.n} places · hover a dot, click to focus</span>}
        {rho != null && <span className="gc-rank" title="Spearman rank correlation across the places">ρ = {rho.toFixed(2)}</span>}
      </div>
    </>
  );
}
