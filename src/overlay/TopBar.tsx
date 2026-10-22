import {Award, Database, LayoutDashboard, LocateFixed, Map as MapIcon, Scan, Settings, type LucideIcon} from 'lucide-react';
import type {ReactNode} from 'react';

export type PageId = 'map' | 'data' | 'about' | 'sandbox';
// Sandbox is built (sandbox.ts) but off for now: add 'Sandbox' back here to bring the tab back.
const MENU = ['Map', 'Dashboard', 'Data', 'Settings'] as const;
// kept apart at the rail's foot, as in the earlier atlas
const FOOT = ['Credits'] as const;
type Item = (typeof MENU)[number] | (typeof FOOT)[number];
const ICON: Record<Item, LucideIcon> = {
  Map: MapIcon, Dashboard: LayoutDashboard, Data: Database, Settings, Credits: Award
};

// The top row, floating over the map with no bar behind it: the name in the earlier
// atlas's tracked capitals, in white; the search in the middle and the tool buttons on the
// right, each on its own faint frosted fill. The tabs live in the rail.
type BarProps = {onRecenter: () => void; is3d: boolean; onToggle3d: () => void; onClean: () => void; search: ReactNode};

export default function TopBar({onRecenter, is3d, onToggle3d, onClean, search}: BarProps) {
  return (
    <header className="topbar">
      <div className="brand"><span className="brand-mark" aria-hidden>✧</span>Seoul Data Atlas</div>
      {search}
      <div className="tools">
        {/* An SVG icon: the ⌖ glyph rendered narrow in the UI font and read as a microphone. */}
        <button className="icon-btn" title="Back to all of Seoul" aria-label="Back to all of Seoul" onClick={onRecenter}>
          <LocateFixed size={18} strokeWidth={1.75} />
        </button>
        <button className={`icon-btn view-3d${is3d ? ' on' : ''}`} aria-pressed={is3d} onClick={onToggle3d}
          title={is3d ? 'Back to a flat 2D map' : 'Tilt into 3D — the first area layer rises by its value'}>3D</button>
        <button className="icon-btn" title="Clean mode — only the map (Esc to leave)" aria-label="Clean mode" onClick={onClean}>
          <Scan size={18} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}

// The tabs, down the left edge as in the earlier atlas: an icon over a short label. Map is
// the map alone; Dashboard opens its window over the map; Data and Credits (the 'about'
// page) cover the map with a page; Sandbox hands the map to plain kepler (sandbox.ts);
// Settings, under Data, opens its panel beside the rail.
type RailProps = {page: PageId; onPage: (p: PageId) => void; dashboardOpen: boolean; onDashboard: () => void;
  settingsOpen: boolean; onSettings: () => void};

export function SideRail({page, onPage, dashboardOpen, onDashboard, settingsOpen, onSettings}: RailProps) {
  const state: Record<Item | 'Sandbox', {on: boolean; go: () => void}> = {
    Map: {on: page === 'map' && !dashboardOpen, go: () => onPage('map')},
    Dashboard: {on: page === 'map' && dashboardOpen, go: onDashboard},
    Data: {on: page === 'data', go: () => onPage(page === 'data' ? 'map' : 'data')},
    Credits: {on: page === 'about', go: () => onPage(page === 'about' ? 'map' : 'about')},
    Sandbox: {on: page === 'sandbox', go: () => onPage(page === 'sandbox' ? 'map' : 'sandbox')},
    Settings: {on: settingsOpen, go: onSettings},
  };
  const item = (m: Item) => {
    const Icon = ICON[m];
    return (
      <button key={m} className={`rail-item${state[m].on ? ' on' : ''}`} aria-pressed={state[m].on} onClick={state[m].go}
        {...(m === 'Settings' ? {'data-settings-tab': '', 'aria-haspopup': 'dialog' as const, 'aria-expanded': settingsOpen} : {})}>
        <Icon size={18} strokeWidth={1.6} aria-hidden />
        <span>{m}</span>
      </button>
    );
  };
  return (
    <nav className="rail glass" aria-label="Pages">
      {MENU.map(item)}
      <div className="rail-foot">{FOOT.map(item)}</div>
    </nav>
  );
}
