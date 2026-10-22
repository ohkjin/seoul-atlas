import {addDataToMap, removeDataset} from '@kepler.gl/actions';
import type {UhusData} from '../data/uhus';

type Dispatch = (action: any) => void;

// The neighbourhood boundaries of the focused district: a thin white outline of its dongs
// drawn over everything, so a district read at Gu detail still shows what it is made of.
// Its own small dataset and layer, out of kepler's layer list (hidden) and of the app's
// cards (not one of the v:/c:/bi:/bc: layers); replaced when the district changes and
// removed when no district is focused. Hovering a line names the dong.
export const OUTLINE_DATA_ID = 'dong_outline';
export const OUTLINE_LAYER_ID = 'o:dongs';
const labelOf = (guCode: string) => `Dong boundaries · ${guCode}`;   // the label says which district

// kepler adds a dataset as a task: for a moment after asking, it is not there yet, and
// asking again would add a second layer with the same id (see drawSelection's pair).
let pending: {guCode: string; at: number} | null = null;

export function showDongOutline(dispatch: Dispatch, visState: any, data: UhusData, guCode: string | null) {
  const current = visState?.datasets?.[OUTLINE_DATA_ID];
  if (current && guCode && current.label === labelOf(guCode)) { pending = null; return; }   // already this district
  if (!current && guCode && pending?.guCode === guCode && Date.now() - pending.at < 3000) return;   // on its way
  if (current) dispatch(removeDataset(OUTLINE_DATA_ID));
  if (!guCode) { pending = null; return; }
  const src: any = data.dong;
  const at = (name: string) => src.fields.findIndex((f: any) => f.name === name);
  const iGu = at('gu_code'), iName = at('dong_name'), iGuName = at('gu_name'), iGeo = at('_geojson');
  const rows = src.rows.filter((r: any[]) => String(r[iGu]) === guCode).map((r: any[]) => [r[iName], r[iGuName], r[iGeo]]);
  if (!rows.length) return;
  pending = {guCode, at: Date.now()};
  dispatch(addDataToMap({
    datasets: [{
      info: {id: OUTLINE_DATA_ID, label: labelOf(guCode)},
      data: {fields: [
        {name: 'dong_name', type: 'string', format: '', analyzerType: 'STRING', displayName: 'Neighbourhood'},
        {name: 'gu_name', type: 'string', format: '', analyzerType: 'STRING', displayName: 'District'},
        {name: '_geojson', type: 'geojson', format: '', analyzerType: 'GEOMETRY', displayName: 'Geometry'},
      ], rows},
    }],
    options: {centerMap: false, keepExistingConfig: true, autoCreateLayers: false},
    // the layer travels with the dataset (see addPair)
    config: {version: 'v1', config: {visState: {layers: [{
      id: OUTLINE_LAYER_ID, type: 'geojson',
      config: {dataId: OUTLINE_DATA_ID, label: 'Dong boundaries', columns: {geojson: '_geojson'}, isVisible: true, hidden: true,
        visConfig: {filled: false, stroked: true, strokeColor: [236, 240, 246], strokeOpacity: 0.55, thickness: 0.8}},
    }]}}},
  } as any));
}
