import {useDispatch, useStore} from 'react-redux';
import {ArrowLeft, Filter} from 'lucide-react';
import {addPlaceFilter} from './sandbox';

// The strip that says the map is kepler's now, with the way back and the two place
// filters kepler's own panel cannot make (one filter across all our datasets).
export default function SandboxBar({onBack}: {onBack: () => void}) {
  const dispatch = useDispatch();
  const store = useStore<any>();
  const get = () => store.getState().keplerGl.map.visState;
  return (
    <div className="sandbox-bar glass" role="region" aria-label="Sandbox">
      <span className="sb-title"><b>Sandbox</b> · kepler.gl</span>
      <span className="sb-hint">Everything here is kepler's own — add data, layers and filters freely.</span>
      <button onClick={() => addPlaceFilter(dispatch, get, 'gu')}><Filter size={13} strokeWidth={1.8} />By district</button>
      <button onClick={() => addPlaceFilter(dispatch, get, 'dong')}><Filter size={13} strokeWidth={1.8} />By neighbourhood</button>
      <button className="sb-back" onClick={onBack}><ArrowLeft size={13} strokeWidth={1.8} />Back to atlas</button>
    </div>
  );
}
