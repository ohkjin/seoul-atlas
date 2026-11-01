import {useSelector} from 'react-redux';
import type {RootState} from '../store';

// kepler registers its instance only after <KeplerGl> mounts, so every read has
// to tolerate `undefined` on the first renders.
export function useKepler(): any {
  return useSelector((s: RootState) => (s.keplerGl as any).map);
}

// The camera (mapState) changes every frame while the map moves — 60 times a second in a
// flight or a drag. A panel that reads the whole instance (useKepler) re-renders with it;
// one that needs only the layers, data and filters reads visState, which the camera leaves
// alone, and one that needs only something about the camera reads that value alone.
export function useVisState(): any {
  return useSelector((s: RootState) => (s.keplerGl as any).map?.visState);
}

export function useMapStyle(): any {
  return useSelector((s: RootState) => (s.keplerGl as any).map?.mapStyle);
}

// a value worked out from the camera: the component re-renders only when the value changes
// (so return a number, string or boolean, not a new object)
export function useCamera<T>(pick: (mapState: any) => T): T {
  return useSelector((s: RootState) => pick((s.keplerGl as any).map?.mapState));
}
