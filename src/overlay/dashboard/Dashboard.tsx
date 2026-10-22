import {useEffect, useMemo} from 'react';
import {Equal, GripHorizontal, Maximize2, Minimize2, X} from 'lucide-react';
import {VAR_BY_KEY, type Variable} from '../../data/catalog';
import type {Place, UhusData} from '../../data/uhus';
import type {Focus} from '../Overlay';
import {useKepler} from '../useKepler';
import {selectionEntries, type Grain, type OnMap} from '../layers';
import {placeSeries} from '../scatter';
import {ourFiltersKey} from '../ourFilters';
import BigScatter from './BigScatter';
import HeatResponse from './HeatResponse';
import Ranking from './Ranking';
import MiniMaps from './MiniMaps';
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
// remembered), maximised by double-clicking its title bar — with four views of the same selection and focus as the map: the scatter,
// large; the heat response of the focused place; the ten highest and lowest places; and
// the whole theme as small maps. Clicking a place in any of them focuses the map there.
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
    [selection.join(), grain, datasetKeys, day, ourFiltersKey(filters)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const entries = visState ? selectionEntries(visState, selection, linked, grain, is3d) : [];
  const ctx: DashCtx = {...props, vars, places, series, datasets, filters, day, entries};

  // first opened: as large as the screen allows (up to 1080×840) at the right, below the
  // top bar; after that, where it was left
  const win = useWindowFrame('seoul-atlas.dashboard', () => {
    const z = uiZoom(), W = window.innerWidth / z, H = window.innerHeight / z;
    return {ax: 'right', x: 16, ay: 'top', y: 76, w: Math.max(Math.min(1080, W - 32), W * 0.72),
      h: Math.max(Math.min(840, H - 84), H - 110)};
  }, MIN);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const placeName = focus.level === 'seoul' ? 'Seoul' : focus.level === 'gu' ? focus.gu.name : focus.dong.name;
  return (
    <div className={`dash glass${win.held ? ' held' : ''}`} role="dialog" aria-label="Dashboard" style={win.style}>
      <div className="dash-head" onPointerDown={win.grab('move')} onDoubleClick={win.toggleMax}>
        <div>
          <div className="dash-eyebrow">Dashboard · {grain === 'dong' ? 'neighbourhoods' : 'districts'}</div>
          <div className="dash-title">{placeName}{vars.length ? ` — ${vars.map((x) => x.short).join(' × ')}` : ''}</div>
        </div>
        <div className="dash-tools">
          <button className="icon-btn dash-close" aria-label={win.maxed ? 'Restore the dashboard' : 'Maximise the dashboard'}
            title={win.maxed ? 'Restore (double-click the title bar)' : 'Maximise (double-click the title bar)'} onClick={win.toggleMax}>
            {win.maxed ? <Minimize2 size={14} strokeWidth={1.75} /> : <Maximize2 size={14} strokeWidth={1.75} />}
          </button>
          <button className="icon-btn dash-close" aria-label="Close the dashboard" title="Close (Esc)" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      <Summary ctx={ctx} />
      <div className="dash-grid">
        <section className="dash-panel"><h3>{vars.length === 2 ? 'Relationship' : 'Spread'}</h3><BigScatter ctx={ctx} /></section>
        <section className="dash-panel"><h3>Heat response</h3><HeatResponse ctx={ctx} /></section>
        <section className="dash-panel"><h3>Ranking{vars[0] ? ` — ${vars[0].short}` : ''}</h3><Ranking ctx={ctx} /></section>
        <section className="dash-panel"><h3>Theme at a glance</h3><MiniMaps ctx={ctx} /></section>
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
