import {useDispatch} from 'react-redux';
import {toggleSidePanel} from '@kepler.gl/actions';

// Replaces kepler's panel header (logo, version, Share). Its rail with the collapse
// arrow is hidden, so this ✕ is the way out of the panel.
function SettingsHeader() {
  const dispatch = useDispatch();
  return (
    <div className="settings-head">
      <div>
        <div className="settings-eyebrow">kepler.gl</div>
        <div className="settings-title">Map settings</div>
      </div>
      <button className="icon-btn settings-close" aria-label="Close settings" title="Close"
        onClick={() => dispatch(toggleSidePanel(null as any) as any)}>✕</button>
    </div>
  );
}

export const SettingsHeaderFactory = () => SettingsHeader;
