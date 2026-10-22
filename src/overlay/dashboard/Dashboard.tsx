import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {X} from 'lucide-react';
import {VAR_BY_KEY, type Variable} from '../../data/catalog';
import type {Place, UhusData} from '../../data/uhus';
import type {Focus} from '../Overlay';
import {useKepler} from '../useKepler';
import {selectionEntries, type Grain, type OnMap} from '../layers';
import {placeSeries} from '../scatter';
import BigScatter from './BigScatter';
import HeatResponse from './HeatResponse';
import Ranking from './Ranking';
import MiniMaps from './MiniMaps';
import {uiZoom} from '../uiScale';
import Summary from './Summary';

type Props = {data: UhusData; focus: Focus; selection: string[]; linked: boolean; grain: Grain; is3d: boolean; playing: boolean;
  onPick: (level: 'dong' | 'gu', code: string) => void; onSelect: (key: string) => void; onClose: () => void};

// What every panel reads: the selection's values per place now, and the map's state.
export type DashCtx = Props & {vars: Variable[]; places: Place[]; series: Map<string, number>[]; datasets: any;
  filters: any[]; day: number; entries: (OnMap & {layer: any})[]};

// The dashboard: a window floating over the map — dragged by its title bar, resized from
// its corner — with four views of the same selection and focus as the map: the scatter,
// large; the heat response of the focused place; the ten highest and lowest places; and
// the whole theme as small maps. Clicking a place in any of them focuses the map there.
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
    [selection.join(), grain, datasetKeys, day]);   // eslint-disable-line react-hooks/exhaustive-deps
  const entries = visState ? selectionEntries(visState, selection, linked, grain, is3d) : [];
  const ctx: DashCtx = {...props, vars, places, series, datasets, filters, day, entries};

  // position: starts beside the Focus text, clear of the top bar; dragged by the head
  // (the overlay is zoomed on large screens, so screen pixels are divided by the zoom)
  const [pos, setPos] = useState(() => ({x: Math.min(360, Math.max(16, window.innerWidth / uiZoom() - 1000)), y: 76}));
  const drag = useRef<{dx: number; dy: number} | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('button')) return;
    const z = uiZoom();
    drag.current = {dx: e.clientX / z - pos.x, dy: e.clientY / z - pos.y};
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const w = root.current?.offsetWidth ?? 600, z = uiZoom();
    setPos({x: Math.max(8 - w + 120, Math.min(window.innerWidth / z - 120, e.clientX / z - drag.current.dx)),
      y: Math.max(8, Math.min(window.innerHeight / z - 60, e.clientY / z - drag.current.dy))});
  };
  // the window grows with a big screen (styles.css); keep its right edge on screen
  useLayoutEffect(() => {
    const w = root.current?.offsetWidth ?? 0;
    const room = window.innerWidth / uiZoom() - w - 16;
    setPos((p) => ({...p, x: Math.max(16, Math.min(p.x, room))}));
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const placeName = focus.level === 'seoul' ? 'Seoul' : focus.level === 'gu' ? focus.gu.name : focus.dong.name;
  return (
    <div ref={root} className="dash glass" role="dialog" aria-label="Dashboard" style={{left: pos.x, top: pos.y}}>
      <div className="dash-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }}>
        <div>
          <div className="dash-eyebrow">Dashboard · {grain === 'dong' ? 'neighbourhoods' : 'districts'}</div>
          <div className="dash-title">{placeName}{vars.length ? ` — ${vars.map((x) => x.short).join(' × ')}` : ''}</div>
        </div>
        <button className="icon-btn dash-close" aria-label="Close the dashboard" title="Close (Esc)" onClick={onClose}>
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
      <Summary ctx={ctx} />
      <div className="dash-grid">
        <section className="dash-panel"><h3>{vars.length === 2 ? 'Relationship' : 'Spread'}</h3><BigScatter ctx={ctx} /></section>
        <section className="dash-panel"><h3>Heat response</h3><HeatResponse ctx={ctx} /></section>
        <section className="dash-panel"><h3>Ranking{vars[0] ? ` — ${vars[0].short}` : ''}</h3><Ranking ctx={ctx} /></section>
        <section className="dash-panel"><h3>Theme at a glance</h3><MiniMaps ctx={ctx} /></section>
      </div>
    </div>
  );
}
