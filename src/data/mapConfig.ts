import {VAR_BY_KEY, layerConfigFor} from './catalog';

// Initial kepler.gl map, in kepler's own saved-map format (version v1). Anything left
// out here falls back to kepler's defaults, so only what we care about is spelled out.
export const SEOUL_VIEW = {latitude: 37.5665, longitude: 126.978, zoom: 10.4, pitch: 0, bearing: 0};

// What is on the map when the page opens. Each one is also that theme's headline.
export const INITIAL_ON_MAP = ['RHSI_retail', 'temp_max'];

export const mapConfig = {
  version: 'v1',
  config: {
    visState: {
      layers: INITIAL_ON_MAP.map((k) => layerConfigFor(VAR_BY_KEY[k])),
      // Time playback runs as a timeRange filter on the daily dataset, starting as a
      // ONE-DAY window (a window spanning the whole year has nowhere to slide). kepler's
      // own widget stays mounted but hidden — it is the animation engine — and our
      // TimePill is the visible control.
      filters: [{id: 'time', dataId: ['gu_daily'], name: ['date'], type: 'timeRange', view: 'minified',
        value: [Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 2) - 1]}],
      interactionConfig: {tooltip: {enabled: true, fieldsToShow: {
        dong: [{name: 'gu_name', format: null}, {name: 'dong_name', format: null}],
        gu_daily: [{name: 'gu_name', format: null}, {name: 'date', format: null}]
      }}}
    },
    mapState: SEOUL_VIEW,
    mapStyle: {styleType: 'dark-matter'}
  }
};
