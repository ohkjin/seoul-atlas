// The datasets behind the atlas, for the Data page: what each one is, where it comes
// from, how the project made it, and which of the app's variables it supplies. Wording
// follows the UHUS data schema (UHUS/Data_schema.csv) and the earlier Seoul Data Atlas.
import {INDUSTRY_KEYS, VARIABLES} from './catalog';

export type SourceKind = 'public' | 'project' | 'restricted';
export type Link = {label: string; url: string};

export type DataSource = {
  id: string; role: 'Inputs' | 'Outcome' | 'Explanation' | 'Base';
  title: string; file: string; kind: SourceKind;
  description: string;
  how?: string;                 // how the project made it (project data)
  space: string; time: string;  // spatial and temporal unit
  span?: [string, string];      // the days its data covers (first, last); none: a snapshot, outside time
  asOf?: string;                // a snapshot's date, when the data records it
  source: string;
  vars: string[];               // the app's variable keys it supplies
  projects: string[];           // the studies that use it (projects.ts)
  links?: Link[];               // the original public data
};

// Public portals, checked by visiting them (Oct 2026). EGIS now redirects to the
// Ministry of Climate, Energy and Environment's address, used here directly.
const KMA: Link = {label: 'KMA Open MET Data Portal', url: 'https://data.kma.go.kr/'};
const SEOUL: Link = {label: 'Seoul Open Data Plaza', url: 'https://data.seoul.go.kr/'};
const EGIS: Link = {label: 'EGIS land cover map', url: 'https://aid.mcee.go.kr/'};
const MOLIT: Link = {label: 'Public Data Portal (MOLIT)', url: 'https://www.data.go.kr/'};
const METRO: Link = {label: 'Seoul Metro station addresses', url: 'https://data.seoul.go.kr/dataList/OA-12035/S/1/datasetView.do'};

export const ROLES: {role: DataSource['role']; sub: string}[] = [
  {role: 'Inputs', sub: 'the raw signals'},
  {role: 'Outcome', sub: 'what the study measures'},
  {role: 'Explanation', sub: 'why it varies between neighborhoods'},
  {role: 'Base', sub: 'what everything is joined on'},
];

export const SOURCES: DataSource[] = [
  {
    projects: ['UHUS'],
    id: 'weather', role: 'Inputs', title: 'Daily Weather', file: 'Daily_Weather.csv', kind: 'public',
    description: 'Daily maximum temperature, apparent temperature, humidity and precipitation for every neighborhood.',
    how: 'Maximum temperature, maximum humidity and precipitation are KMA observations summarized per dong and day. ' +
      'Apparent maximum temperature is computed with the KMA summer apparent-temperature formula.',
    space: 'Dong · 422', time: 'Day · 366 (2024)', span: ['2024-01-01', '2024-12-31'], source: 'Korea Meteorological Administration (KMA)',
    vars: ['temp_max', 'apptemp_max', 'humid_max', 'precip_sum'], links: [KMA],
  },
  {
    projects: ['UHUS'],
    id: 'sales', role: 'Inputs', title: 'Sales Signal', file: 'sales.csv', kind: 'restricted',
    description: 'Daily card-sales amounts across 84 industries per neighborhood — the behavioral signal behind ' +
      'retail heat sensitivity. Provided to the project by the Seoul AI Foundation; not openly available.',
    how: 'Retail sales sum the 19 retail industries used for RHSI. The six themed totals group all industries into food & ' +
      'beverage; retail & daily goods; fashion & beauty; health, education & culture; leisure, mobility & lodging; and ' +
      'housing, professional & local services. Each of the 84 industries can be mapped on its own, in its sector’s folder.',
    space: 'Dong · 422', time: 'Day · 366 (2024)', span: ['2024-01-01', '2024-12-31'], source: 'Seoul AI Foundation',
    vars: ['retail_total_amount', 'sales_fnb', 'sales_retail', 'sales_fashion', 'sales_health', 'sales_leisure', 'sales_housing',
      ...INDUSTRY_KEYS],
  },
  {
    projects: ['UHUS'],
    id: 'rhsi', role: 'Outcome', title: 'Retail Heat Sensitivity (RHSI)', file: 'RHSI.csv', kind: 'project',
    description: 'How much a neighborhood’s retail sales change on hot days — the study’s main output. Below zero, ' +
      'sales fall in the heat.',
    how: 'RHSI = log(mean daily retail sales on hot days ÷ mean daily retail sales on mild days), per dong, with the hot ' +
      'and mild days counted alongside. A day is hot when it reaches 33 °C apparent; mild when it stays within 18–26 °C, ' +
      'with no rain and not a public holiday.',
    space: 'Dong · 422', time: 'Hot vs mild days, 2024', span: ['2024-01-01', '2024-12-31'], source: 'UHUS analysis (Seoul AI Foundation sales; KMA weather)',
    vars: ['RHSI_retail', 'n_hot_days', 'n_mild_days'],
  },
  {
    projects: ['UHUS'],
    id: 'context', role: 'Explanation', title: 'Urban Context', file: 'Urban_Features.csv', kind: 'project',
    description: 'Who lives in a neighborhood and what it is built of — demography, land use, housing age, activity ' +
      'venues and land price — the context that helps explain RHSI.',
    how: 'Each variable is a share of the dong’s population or area, a count per km², or (land price) the log of the mean ' +
      'official land price, built from the public sources below.',
    space: 'Dong · 422', time: 'Static', source: 'Seoul Open Data Plaza · EGIS · MOLIT',
    vars: ['elderly_share', 'low_income_share', 'residential_area_share', 'commercial_area_share', 'leisure_area_share',
      'transportation_area_share', 'public_facility_area_share', 'green_space_share', 'aged_housing_share',
      'activity_facility_density', 'land_price'],
    links: [SEOUL, EGIS, MOLIT],
  },
  {
    projects: ['UHUS'],
    id: 'mobility', role: 'Explanation', title: 'Mobility', file: 'Urban_Features.csv', kind: 'project',
    description: 'How people move and how reachable a neighborhood is — the daytime population’s response to heat is ' +
      'the strongest single driver of RHSI.',
    how: 'Day/night population ratio; the log-ratio of daytime population on hot vs mild days; the share of the dong ' +
      'within reach of a subway station; bus stops and parking spaces per km².',
    space: 'Dong · 422', time: 'Static (from 2024)', source: 'Seoul Open Data Plaza · Seoul Metro',
    vars: ['dnpr', 'delta_daypop', 'subway_access_coverage', 'bus_stop_density', 'parking_capacity'],
    links: [SEOUL, METRO],
  },
  {
    projects: ['UHUS'],
    id: 'salesmix', role: 'Explanation', title: 'Sales Composition', file: 'Urban_Features.csv', kind: 'project',
    description: 'The retail make-up of a neighborhood: how much of its card spending goes to retail, dining, everyday ' +
      'shops, general and large-format stores.',
    how: 'Each sector’s card-sales amount ÷ the dong’s total card-sales amount over 2024; the “(retail)” versions divide ' +
      'by its retail card sales instead.',
    space: 'Dong · 422', time: 'Aggregated 2024', span: ['2024-01-01', '2024-12-31'], source: 'Seoul AI Foundation (processed)',
    vars: ['retail_share', 'dinebev_share_all', 'everyday_retail_share_all', 'general_share_all', 'large_format_share_all',
      'dinebev_share_retail', 'everyday_retail_share_retail', 'general_share_retail', 'large_format_share_retail'],
  },
  {
    projects: ['UHUS'],
    id: 'shap', role: 'Explanation', title: 'SHAP Contributions', file: 'shap_result.csv', kind: 'project',
    description: 'For each neighborhood, how much each model input pushed its predicted RHSI up or down. It explains ' +
      'the model’s behavior, not cause and effect.',
    how: 'SHAP values of a model predicting RHSI from 25 neighborhood features: the model’s RHSI for a dong is a base ' +
      'value plus its 25 contributions. All 25 are mapped, in RHSI’s folder.',
    space: 'Dong · 422', time: 'Static', source: 'UHUS model output',
    vars: VARIABLES.filter((x) => x.key.startsWith('shap_')).map((x) => x.key),
  },
  // Public daily data no study uses (yet): Seoul's own counts of people and movement, per dong and day
  // (scripts/build-subway, build-bus, build-bike, build-livepop.mjs; files in public/data/opendata).
  {
    projects: [],
    id: 'livepop', role: 'Inputs', title: 'Living Population', file: '250_LOCAL_RESD_ADMDONG_2024MM.zip', kind: 'public',
    description: 'How many people are in each neighborhood, hour by hour — residents, workers and visitors alike — ' +
      'estimated by Seoul and KT from mobile-network data (Korean nationals).',
    how: 'The hourly counts per dong (250 m cells summed to dongs) averaged per day: over the 24 hours, over 09–17 h ' +
      '(daytime) and over 00–05 h (night-time). 상일1·2동 are summed into 상일동; 항동, 둔촌1동 and 반포본동 have no atlas ' +
      'dong and are left out, as in the sales data.',
    space: 'Dong · 422', time: 'Day · 366 (2024)', span: ['2024-01-01', '2024-12-31'], source: 'Seoul Metropolitan Government · KT',
    vars: ['livepop_mean', 'livepop_day', 'livepop_night'],
    links: [{label: 'Seoul Open Data Plaza OA-23016', url: 'https://data.seoul.go.kr/dataList/OA-23016/S/1/datasetView.do'}],
  },
  {
    projects: [],
    id: 'subway', role: 'Inputs', title: 'Subway Ridership', file: 'CARD_SUBWAY_MONTH_<YYYY | YYYYMM>.csv', kind: 'public',
    description: 'Transit-card boardings and alightings at every subway station, day by day, from 2015.',
    how: 'Each station is placed by the station master list and counted in the dong it stands in; a dong’s value is the ' +
      'sum over its stations (229 dongs have one; fewer in the early years, before newer lines opened). Stations ' +
      'outside Seoul are left out. The station points on the map are 2024’s.',
    space: 'Station · 324 → Dong · 229', time: 'Day · Jan 2015 – Sep 2026', span: ['2015-01-01', '2026-09-30'], source: 'Seoul Metropolitan Government',
    vars: ['subway_board', 'subway_alight'],
    links: [{label: 'Seoul Open Data Plaza OA-12914', url: 'https://data.seoul.go.kr/dataList/OA-12914/S/1/datasetView.do'},
      {label: 'Station master OA-21232', url: 'https://data.seoul.go.kr/dataList/OA-21232/S/1/datasetView.do'}],
  },
  {
    projects: [],
    id: 'bus', role: 'Inputs', title: 'Bus Ridership', file: 'BUS_STATION_BOARDING_MONTH_2024MM.csv', kind: 'public',
    description: 'Transit-card boardings and alightings at every bus stop, day by day (city, express and village buses).',
    how: 'Routes are summed per stop; each stop is placed by the December 2024 stop list and counted in its dong. ' +
      'About 4.8% of boardings are at stops missing from that list and are left out.',
    space: 'Stop · 10,600 → Dong · 422', time: 'Day · 366 (2024)', span: ['2024-01-01', '2024-12-31'], source: 'Seoul Metropolitan Government',
    vars: ['bus_board', 'bus_alight'],
    links: [{label: 'Seoul Open Data Plaza OA-12912', url: 'https://data.seoul.go.kr/dataList/OA-12912/S/1/datasetView.do'},
      {label: 'Bus stop locations OA-15067', url: 'https://data.seoul.go.kr/dataList/OA-15067/S/1/datasetView.do'}],
  },
  {
    projects: [],
    id: 'bike', role: 'Inputs', title: 'Public Bike Rentals', file: 'bike_daily_24MM.csv', kind: 'public',
    description: 'Rentals of Seoul’s public bikes (Ttareungyi) at every dock, day by day.',
    how: 'Rentals are summed over user groups per dock and day; each dock is placed by the December 2024 dock list and ' +
      'counted in its dong. About 1.1% of rentals are at docks with no location and are left out.',
    space: 'Dock · 2,721 → Dong · 411', time: 'Day · 366 (2024)', span: ['2024-01-01', '2024-12-31'], source: 'Seoul Metropolitan Government',
    vars: ['bike_rentals'],
    links: [{label: 'Seoul Open Data Plaza OA-15246', url: 'https://data.seoul.go.kr/dataList/OA-15246/F/1/datasetView.do'},
      {label: 'Dock list OA-13252', url: 'https://data.seoul.go.kr/dataList/OA-13252/F/1/datasetView.do'}],
  },
  {
    projects: ['UHUS'],
    id: 'geometry', role: 'Base', title: 'Dong Boundaries', file: 'Administrative_Dong_Geometry.geojson', kind: 'public',
    description: 'The 422 administrative neighborhood (dong) boundaries every variable is mapped and joined on; the 25 ' +
      'districts (gu) are their union.',
    how: 'Simplified for the web; dong codes join every dataset above.',
    space: 'Dong · 422 / Gu · 25', time: 'Static', source: 'Seoul Open Data Plaza', vars: [], links: [SEOUL],
  },
];

const DAY = 86400000;
// a variable whose days differ from its dataset's: the daytime population's response to heat
// is worked out from 2024's hot and mild days (Data_schema.csv), though Mobility is a snapshot
const VAR_SPAN: Record<string, [string, string]> = {delta_daypop: ['2024-01-01', '2024-12-31']};
// The days a variable's data covers, from its dataset, as [first midnight, last midnight] (UTC):
// null for a snapshot (land use, the model's outputs) — it holds whatever period is picked.
export function spanOf(key: string): [number, number] | null {
  const s = VAR_SPAN[key] ?? SOURCES.find((x) => x.vars.includes(key))?.span;
  return s ? [Date.parse(s[0]), Date.parse(s[1])] : null;
}
// a snapshot's date, where its data records one (none does yet: Data_schema.csv gives no years)
export function asOfOf(key: string): number | null {
  const d = SOURCES.find((x) => x.vars.includes(key))?.asOf;
  return d ? Date.parse(d) : null;
}
// every day the atlas has data for: the time ruler's whole length
export const DATA_SPAN: [number, number] = (() => {
  const spans = SOURCES.flatMap((x) => (x.span ? [[Date.parse(x.span[0]), Date.parse(x.span[1])]] : []));
  return [Math.min(...spans.map((x) => x[0])), Math.max(...spans.map((x) => x[1]))];
})();
// the year the time ruler opens on: the one every daily variable covers (the subway alone runs
// 2015–2026), so the map opens with all of them playing
export const OPENING_YEAR = 2024;
// whether a variable has data in a period [start, end) — a snapshot always does
export const coversPeriod = (key: string, period: [number, number]) => {
  const s = spanOf(key);
  return !s || (s[0] < period[1] && s[1] + DAY > period[0]);
};

export const KIND_LABEL: Record<SourceKind, string> = {public: 'Public', project: 'Project', restricted: 'Restricted'};

// How far a variable stands from its raw data — Source (as published or delivered, only
// shaped to dongs and days), Processed (an index the lab built from it, no model), Research
// (a study's result: an index, a model's output) — and, apart from that, whether it is open.
// A Processed or Research variable belongs to a study; a Source one to none, only used by
// studies. Its ladder names each step it was built through, from the Data page's wording.
export type Tier = 'source' | 'processed' | 'research';
export const TIER_LABEL: Record<Tier, string> = {source: 'Source', processed: 'Processed', research: 'Research'};
const TIER_OF: Record<string, Tier> = {weather: 'source', sales: 'source', geometry: 'source', context: 'processed',
  mobility: 'processed', salesmix: 'processed', rhsi: 'research', shap: 'research'};
// the counts of hot and mild days come with RHSI's file, but are a step below it: the lab's count
const PROCESSED_KEYS = new Set(['n_hot_days', 'n_mild_days']);
// [source, processed] steps under each dataset's variables; null where the variable stands
const STEPS: Record<string, [string, string | null]> = {
  weather: ['KMA weather', null], sales: ['Card sales (Seoul AI Foundation)', null],
  context: ['Seoul Open Data Plaza · EGIS · MOLIT', null], mobility: ['Seoul Open Data Plaza · Seoul Metro', null],
  salesmix: ['Card sales (Seoul AI Foundation)', null], rhsi: ['KMA weather · card sales', 'Hot / mild days per dong'],
  shap: ['Neighbourhood features · RHSI', '25 features per dong'],
};
const STUDY = 'UHUS';
export type Provenance = {tier: Tier; project: string | null; usedBy: string[]; restricted: boolean;
  ladder: [string, string, string]; source: DataSource};
export function provenanceOf(key: string): Provenance | null {
  const source = SOURCES.find((s) => s.vars.includes(key));
  if (!source) return null;
  const tier: Tier = PROCESSED_KEYS.has(key) ? 'processed' : TIER_OF[source.id] ?? 'source';
  const [raw, mid] = STEPS[source.id] ?? [source.source, null];
  const self = `${VARIABLES.find((x) => x.key === key)?.short ?? key} · ${STUDY}`;
  const ladder: [string, string, string] = tier === 'source' ? [raw, '—', '—']
    : tier === 'processed' ? [PROCESSED_KEYS.has(key) ? 'KMA weather' : raw, self, '—'] : [raw, mid ?? '—', self];
  // card sales reach RHSI and the sales mix, so those are built from restricted data, but are open themselves
  return {tier, project: tier === 'source' ? null : STUDY, usedBy: source.projects, restricted: source.kind === 'restricted', ladder, source};
}
