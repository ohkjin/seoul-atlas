import {useSelector} from 'react-redux';
import type {RootState} from '../store';

// kepler registers its instance only after <KeplerGl> mounts, so every read has
// to tolerate `undefined` on the first renders.
export function useKepler(): any {
  return useSelector((s: RootState) => (s.keplerGl as any).map);
}
