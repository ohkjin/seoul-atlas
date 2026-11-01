import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {Equal, GripHorizontal, Maximize2, Minimize2, X} from 'lucide-react';
import {THEMES, VAR_BY_KEY, type Variable} from '../../data/catalog';
import type {Place, UhusData} from '../../data/uhus';
import type {Focus} from '../Overlay';
import {useKepler} from '../useKepler';
import {selectionEntries, type Grain, type OnMap} from '../layers';
import {placeSeries} from '../scatter';
import {filtersKey} from '../ourFilters';
import BigScatter from './BigScatter';
import HeatResponse from './HeatResponse';
import Ranking from './Ranking';
import MiniMaps from './MiniMaps';
import ShapPanel from './ShapPanel';
import SalesPanel, {isSalesKey} from './SalesPanel';
import WeatherPanel, {isWeatherKey} from './WeatherPanel';
import EffectPanel, {isInputKey} from './EffectPanel';
import DistrictPanel from './DistrictPanel';
import {uiZoom} from '../uiScale';
import {useWindowFrame, type Grip} from '../useWindowFrame';
import Summary from './Summary';

type Props = {data: UhusData; focus: Focus; selection: string[]; linked: boolean; grain: Grain; is3d: boolean; playing: boolean;
  onPick: (level: 'dong' | 'gu', code: string) => void; onSelect: (key: string) => void; onClose: () => void};

// What every panel reads: the selection's values per place now, and the map's state.
export type DashCtx = Props & {vars: Variable[]; places: Place[]; series: Map<string, number>[]; datasets: any;
  filters: any[]; day: number; entries: (OnMap & {layer: any})[]};

// The dashboard: a window floating over the map — moved and resized the way kepler.gl's
// legend is (useWindowFrame: grips that show on hover, anchored to the nearer edges,
// remembered), maximised by double-clicking its title bar — with views of the same
// selection and focus as the map, each a half of the window: the scatter; the heat response
// of the focused place; every place in order with the ten highest and lowest; the whole
// theme as maps with the place's profile; then for what is on the map, sales, their year
// and the heat (SalesPanel); RHSI or SHAP, what drives it; daily weather, its year; a model
// input, what it does to RHSI; anything else, its neighbourhoods by district. Any panel expands to fill the
// window (its button, or a double-click on its name; Esc restores). Clicking a place in any
// of them focuses the map there.
const MIN = {w: 560, h: 380};
const EDGES: Grip[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export default function Dashboard(props: Props) {
  const {data, selection, linked, grain, is3d, focus, onClose} = props;
  const kepler = useKepler();
  const visState = kepler?.visState;
  const filters = visState?.filters || [];
  const datasets = visState?.datasets;
  const day = Math.ceil((filters.find((f: any) => f.id === 'time')?.value?.[0] ?? 0) / 86400000);
  const vars = useMemo(() => selection.map((k) => VAR_BY_KEY[k]).filter(Boolean) as Variable[], [selection.join()]);   // eslint-disable-line react-hooks/exhaustive-deps
  const places: Place[] = grain === 'dong' ? data.dongs : data.gus;
  // kepler hands out new dataset objects on every filter step; the values only change with
  // the day or when a dataset arrives, so those are what the memo watches
  const datasetKeys = Object.keys(datasets || {}).join();
  const series = useMemo(() => placeSeries(datasets, vars, grain, filters),
    [selection.join(), grain, datasetKeys, day, filtersKey(filters)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const entries = visState ? selectionEntries(visState, selection, linked, grain, is3d) : [];
  const ctx: DashCtx = {...props, vars, places, series, datasets, filters, day, entries};

  // First opened: the rest of the screen beside the place panel and below the search —
  // neither the place's name nor the search covered; after that, where it was left. (A new
  // key, so a place remembered from the earlier default does not hide this one.)
  const win = useWindowFrame('seoul-atlas.dashboard.v2', () => {
    const z = uiZoom(), W = window.innerWidth / z, H = window.innerHeight / z;
    const edge = (sel: string, side: 'right' | 'bottom') => (document.querySelector(sel)?.getBoundingClientRect()[side] ?? 0) / z;
    const left = Math.max(104, edge('section.focus', 'right') + 12), top = Math.max(76, edge('.search', 'bottom') + 12);
    return {ax: 'right', x: 16, ay: 'top', y: top, w: W - 16 - left, h: H - top - 16};
  }, MIN);
  // the panels are halves of the grid's visible height (--grid-h in styles.css), and an
  // expanded one all of it
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const ro = new ResizeObserver(() => el.style.setProperty('--grid-h', `${el.clientHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // one panel at a time fills the grid; Esc puts it back before it closes the window
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (expanded) setExpanded(null); else onClose(); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, expanded]);
  const panel = (id: string, title: string, body: ReactNode) => {
    const big = expanded === id, toggle = () => setExpanded(big ? null : id);
    return (
      <section key={id} className={`dash-panel${big ? ' expanded' : expanded ? ' hidden' : ''}`}>
        <div className="dash-panel-head" onDoubleClick={toggle}>
          <h3>{title}</h3>
          <button className="dash-expand" onClick={toggle} aria-label={big ? `Restore ${title}` : `Expand ${title}`}
            title={big ? 'Restore (Esc)' : 'Expand to the whole window'}>
            {big ? <Minimize2 size={12} strokeWidth={1.75} /> : <Maximize2 size={12} strokeWidth={1.75} />}
          </button>
        </div>
        {body}
      </section>
    );
  };

  const placeName = focus.level === 'seoul' ? 'Seoul' : focus.level === 'gu' ? focus.gu.name : focus.dong.name;
  // The last panels follow what is on the map, the main's first: sales bring their year
  // (SalesPanel), RHSI or a SHAP contribution its drivers (ShapPanel), daily weather its year
  // in the same frame (WeatherPanel), one of the model's inputs what it does to RHSI
  // (EffectPanel), anything else its neighbourhoods by district (DistrictPanel). One of a kind.
  const wide = vars.map((x) => ({key: x.key, kind: isSalesKey(x.key) ? 'sales'
    : x.key === 'RHSI_retail' || x.key.startsWith('shap_') ? 'shap'
    : isWeatherKey(x.key) ? 'weather' : isInputKey(x.key) ? 'effect' : x.dataset === 'dong' ? 'district' : null}))
    .filter((w, i, a): w is {kind: string; key: string} => !!w.kind && a.findIndex((v) => v.kind === w.kind) === i);
  const name = (key: string) => VAR_BY_KEY[key]?.long ?? VAR_BY_KEY[key]?.short.replace(/ \(daily\)$/, '') ?? key;
  const widePanel = (w: {kind: string; key: string}) => {
    switch (w.kind) {
      case 'sales': return panel('sales', 'Sales — the year, and the heat', <SalesPanel ctx={ctx} salesKey={w.key} />);
      case 'shap': return panel('shap', 'What drives RHSI — SHAP', <ShapPanel ctx={ctx} />);
      case 'weather': return panel('weather', 'Weather — the year, and the heat', <WeatherPanel ctx={ctx} weatherKey={w.key} />);
      case 'effect': return panel('effect', `${name(w.key)} — what it does to heat sensitivity`, <EffectPanel ctx={ctx} inputKey={w.key} />);
      default: return panel('district', `${name(w.key)} — by district`, <DistrictPanel ctx={ctx} varKey={w.key} />);
    }
  };
  return (
    <div className={`dash glass${win.held ? ' held' : ''}`} role="dialog" aria-label="Dashboard" style={win.style}>
      <div className="dash-head" onPointerDown={win.grab('move')} onDoubleClick={win.toggleMax}>
        <div>
          <div className="dash-eyebrow">Dashboard · {grain === 'dong' ? 'neighborhoods' : 'districts'}</div>
          <div className="dash-title">{placeName}{vars.length ? ` — ${vars.map((x) => x.long ?? x.short).join(' × ')}` : ''}</div>
        </div>
        <div className="dash-tools">
          <button className="icon-btn dash-close" aria-label={win.maxed ? 'Restore the dashboard' : 'Maximize the dashboard'}
            title={win.maxed ? 'Restore (double-click the title bar)' : 'Maximize (double-click the title bar)'} onClick={win.toggleMax}>
            {win.maxed ? <Minimize2 size={14} strokeWidth={1.75} /> : <Maximize2 size={14} strokeWidth={1.75} />}
          </button>
          <button className="icon-btn dash-close" aria-label="Close the dashboard" title="Close (Esc)" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      <Summary ctx={ctx} />
      <div className={`dash-grid${expanded ? ' expanded' : ''}`} ref={grid}>
        {panel('scatter', vars.length === 2 ? 'Relationship' : 'Spread', <BigScatter ctx={ctx} />)}
        {panel('heat', 'Heat response', <HeatResponse ctx={ctx} />)}
        {panel('ranking', `Ranking${vars[0] ? ` — ${vars[0].long ?? vars[0].short}` : ''}`, <Ranking ctx={ctx} />)}
        {panel('theme', `${THEMES.find((t) => t.key === vars[0]?.theme)?.label ?? 'Theme'} at a glance`, <MiniMaps ctx={ctx} />)}
        {wide.map(widePanel)}
      </div>
      {/* kepler's grips: a move handle centred on the top edge, resize handles on the
          bottom and right edges, and every edge and corner resizable */}
      <div className="dash-grip move" onPointerDown={win.grab('move')} title="Move"><GripHorizontal size={14} /></div>
      <div className="dash-grip s" onPointerDown={win.grab('s')} title="Resize"><Equal size={14} /></div>
      <div className="dash-grip e" onPointerDown={win.grab('e')} title="Resize"><Equal size={14} /></div>
      {EDGES.map((g) => <div key={g} className={`dash-edge ${g}`} onPointerDown={win.grab(g)} aria-hidden />)}
    </div>
  );
}
