import {AddDataButtonFactory, DatasetSectionFactory, FilterPanelHeaderFactory, SourceDataCatalogFactory} from '@kepler.gl/components';
import {Children} from 'react';
import {Lock} from 'lucide-react';

// What the atlas builds for itself shows in kepler's settings panel as what it is, and stays
// put: the datasets that carry 3D cells, the 3×3 pair and a district's outline sit apart
// under "Built for the map", without kepler's remove button; the playback filter reads as
// such and has no remove button either. Everything else in the panel is the person's to change.
const BUILT = ['dong_cells', 'gu_cells', 'dong_pair', 'gu_pair', 'dong_outline'];
const isBuilt = (id: string) => BUILT.includes(id);
const LOCKED = 'Made by the atlas for this map · kept';

// kepler's Datasets section with only the data in it (its count too), then the built ones
function AtlasDatasetSectionFactory(SourceDataCatalog: any, AddDataButton: any) {
  const DatasetSection = (DatasetSectionFactory as any)(SourceDataCatalog, AddDataButton);
  return function AtlasDatasetSection(props: any) {
    const pick = (built: boolean) => Object.fromEntries(Object.entries(props.datasets || {}).filter(([id]) => isBuilt(id) === built));
    const built = pick(true);
    const n = Object.keys(built).length;
    return (
      <>
        <DatasetSection {...props} datasets={pick(false)} />
        {props.showDatasetList && n > 0 && (
          <div className="built-for-map" title={LOCKED}>
            <div className="bfm-title">Built for the map ({n})</div>
            <p className="bfm-note">Made by the atlas for 3D and the 3×3 map; they follow what is on the map.</p>
            <SourceDataCatalog datasets={built} showDatasetTable={props.showDatasetTable} updateTableColor={props.updateTableColor}
              removeDataset={props.removeDataset} showDeleteDataset={false} />
          </div>
        )}
      </>
    );
  };
}
AtlasDatasetSectionFactory.deps = [SourceDataCatalogFactory, AddDataButtonFactory];

// kepler's filter header; the playback filter ('time') named so, with a lock for its bin —
// and a lock on each of its datasets' rows too (kepler styles those, so they come with a
// className), which keep their own field selector. The head keeps its other actions (enlarge).
function AtlasFilterPanelHeaderFactory(...deps: any[]) {
  const FilterPanelHeader = (FilterPanelHeaderFactory as any)(...deps);
  return function AtlasFilterPanelHeader(props: any) {
    if (props.filter?.id !== 'time') return <FilterPanelHeader {...props} />;
    const lock = <span className="playback-lock" title={LOCKED}><Lock size={13} strokeWidth={1.8} /></span>;
    return (
      <FilterPanelHeader {...props} actionItems={[]}>
        {props.className ? props.children
          : Children.toArray(props.children).map((c, i) => (i === 0 ? <span key="name" className="playback-filter">Playback · date</span> : c))}
        {lock}
      </FilterPanelHeader>
    );
  };
}
AtlasFilterPanelHeaderFactory.deps = (FilterPanelHeaderFactory as any).deps;

export const builtForTheMap = [
  [DatasetSectionFactory, AtlasDatasetSectionFactory],
  [FilterPanelHeaderFactory, AtlasFilterPanelHeaderFactory]
];
