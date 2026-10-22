import {LocateFixed} from 'lucide-react';

export type PageId = 'map' | 'data' | 'about';
const MENU = ['Map', 'Dashboard', 'Data', 'About', 'Settings'] as const;

// Floating over the map like the reference: one blurred bubble from the name across the
// tabs to the tool buttons on the right, with the current tab lit inside it. Map is the
// map alone; Dashboard opens its window over the map; Data and About cover the map with a
// page; Settings drops a panel from the bar.
type Props = {onRecenter: () => void; is3d: boolean; onToggle3d: () => void;
  page: PageId; onPage: (p: PageId) => void; dashboardOpen: boolean; onDashboard: () => void;
  settingsOpen: boolean; onSettings: () => void};

export default function TopBar({onRecenter, is3d, onToggle3d, page, onPage, dashboardOpen, onDashboard, settingsOpen, onSettings}: Props) {
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  const state: Record<(typeof MENU)[number], {on: boolean; go: () => void}> = {
    Map: {on: page === 'map' && !dashboardOpen, go: () => onPage('map')},
    Dashboard: {on: page === 'map' && dashboardOpen, go: onDashboard},
    Data: {on: page === 'data', go: () => onPage(page === 'data' ? 'map' : 'data')},
    About: {on: page === 'about', go: () => onPage(page === 'about' ? 'map' : 'about')},
    Settings: {on: settingsOpen, go: onSettings},
  };
  return (
    <header className="topbar glass">
      <div className="brand">Seoul Atlas</div>
      <nav className="menu">
        {MENU.map((m) => (
          <button key={m} className={`menu-item${state[m].on ? ' on' : ''}`} aria-pressed={state[m].on} onClick={state[m].go}
            {...(m === 'Settings' ? {'data-settings-tab': '', 'aria-haspopup': 'dialog' as const, 'aria-expanded': settingsOpen} : {})}>{m}</button>
        ))}
      </nav>
      <div className="tools">
        {/* An SVG icon: the ⌖ glyph rendered narrow in the UI font and read as a microphone. */}
        <button className="icon-btn" title="Back to all of Seoul" aria-label="Back to all of Seoul" onClick={onRecenter}>
          <LocateFixed size={18} strokeWidth={1.75} />
        </button>
        <button className={`icon-btn view-3d${is3d ? ' on' : ''}`} aria-pressed={is3d} onClick={onToggle3d}
          title={is3d ? 'Back to a flat 2D map' : 'Tilt into 3D — the first area layer rises by its value'}>3D</button>
        <button className="icon-btn" title="Full screen" onClick={toggleFullscreen}>⛶</button>
      </div>
    </header>
  );
}
