import {useEffect, useRef, useState} from 'react';
import {useDispatch} from 'react-redux';
import {PanelHeaderFactory, injectComponents} from '@kepler.gl/components';
import {addDataToMap} from '@kepler.gl/actions';
import AutoSizer from 'react-virtualized/dist/commonjs/AutoSizer';
import {loadUhus, type UhusData} from './data/uhus';
import {mapConfig} from './data/mapConfig';
import Overlay from './overlay/Overlay';
import {keplerTheme} from './kepler/theme';
import {SettingsHeaderFactory} from './kepler/SettingsHeader';

export const KEPLER_ID = 'map';

// kepler with its settings-panel header swapped for ours (kepler's injectComponents).
const KeplerGl = injectComponents([[PanelHeaderFactory, SettingsHeaderFactory]] as any);

export default function App() {
  const dispatch = useDispatch();
  const [data, setData] = useState<UhusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;   // addDataToMap must run exactly once
    started.current = true;
    loadUhus()
      .then((d) => {
        setData(d);
        dispatch(addDataToMap({
          datasets: [
            {info: {id: 'dong', label: 'Dong'}, data: d.dong},
            {info: {id: 'gu', label: 'Gu'}, data: d.gu},
            {info: {id: 'gu_daily', label: 'Gu · daily'}, data: d.guDaily},
            {info: {id: 'dong_cells', label: 'Dong · cells'}, data: d.dongCells},
            {info: {id: 'gu_cells', label: 'Gu · cells'}, data: d.guCells}
          ],
          options: {centerMap: false, readOnly: false},
          config: mapConfig
        } as any));
      })
      .catch((e) => setError(String(e)));
  }, [dispatch]);

  return (
    <div className="app">
      <div className="map-layer">
        <AutoSizer>
          {({height, width}: {height: number; width: number}) => (
            <KeplerGl id={KEPLER_ID} mapboxApiAccessToken="" width={width} height={height} theme={keplerTheme} />
          )}
        </AutoSizer>
      </div>
      <Overlay data={data} />
      {error && <div className="load-error">Data failed to load: {error}</div>}
    </div>
  );
}
