// The datasets behind the atlas, for the Data page: what each one is, where it comes
// from, how the project made it, and which of the app's variables it supplies. Wording
// follows the UHUS data schema (UHUS/Data_schema.csv) and the earlier Seoul Data Atlas.

export type SourceKind = 'public' | 'project' | 'restricted';
export type Link = {label: string; url: string};

export type DataSource = {
  id: string; role: 'Inputs' | 'Outcome' | 'Explanation' | 'Base';
  title: string; file: string; kind: SourceKind;
  description: string;
  how?: string;                 // how the project made it (project data)
  space: string; time: string;  // spatial and temporal unit
  source: string;
  vars: string[];               // the app's variable keys it supplies
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
  {role: 'Explanation', sub: 'why it varies between neighbourhoods'},
  {role: 'Base', sub: 'what everything is joined on'},
];

export const SOURCES: DataSource[] = [
  {
    id: 'weather', role: 'Inputs', title: 'Daily Weather', file: 'Daily_Weather.csv', kind: 'public',
    description: 'Daily weather for every neighbourhood across 2024 — the heat exposure the study compares sales against.',
    how: 'Maximum temperature, maximum humidity and precipitation are KMA observations summarised per dong and day. ' +
      'Apparent maximum temperature is computed with the KMA summer apparent-temperature formula. A day is hot when it ' +
      'reaches 33 °C apparent; mild when it stays within 18–26 °C, with no rain and not a public holiday.',
    space: 'Dong · 422', time: 'Day · 366 (2024)', source: 'Korea Meteorological Administration (KMA)',
    vars: ['temp_max', 'apptemp_max', 'humid_max', 'precip_sum'], links: [KMA],
  },
  {
    id: 'sales', role: 'Inputs', title: 'Sales Signal', file: 'sales.csv', kind: 'restricted',
    description: 'Daily card-sales amounts across about 85 industries per neighbourhood — the behavioural signal behind ' +
      'retail heat sensitivity. Provided to the project by the Seoul AI Foundation; not openly available.',
    how: 'Retail sales sum the 19 retail industries used for RHSI. The six themed totals group all industries into food & ' +
      'beverage; retail & daily goods; fashion & beauty; health, education & culture; leisure, mobility & lodging; and ' +
      'housing, professional & local services.',
    space: 'Dong · 422', time: 'Day · 366 (2024)', source: 'Seoul AI Foundation',
    vars: ['retail_total_amount', 'sales_fnb', 'sales_retail', 'sales_fashion', 'sales_health', 'sales_leisure', 'sales_housing'],
  },
  {
    id: 'rhsi', role: 'Outcome', title: 'Retail Heat Sensitivity (RHSI)', file: 'RHSI.csv', kind: 'project',
    description: 'How much a neighbourhood’s retail sales change on hot days — the study’s main output. Below zero, ' +
      'sales fall in the heat.',
    how: 'RHSI = log(mean daily retail sales on hot days ÷ mean daily retail sales on mild days), per dong, with the hot ' +
      'and mild days counted alongside.',
    space: 'Dong · 422', time: 'Hot vs mild days, 2024', source: 'UHUS analysis (Seoul AI Foundation sales; KMA weather)',
    vars: ['RHSI_retail', 'n_hot_days', 'n_mild_days'],
  },
  {
    id: 'context', role: 'Explanation', title: 'Urban Context', file: 'Urban_Features.csv', kind: 'project',
    description: 'Who lives in a neighbourhood and what it is built of — demography, land use, housing age, activity ' +
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
    id: 'mobility', role: 'Explanation', title: 'Mobility', file: 'Urban_Features.csv', kind: 'project',
    description: 'How people move and how reachable a neighbourhood is — the daytime population’s response to heat is ' +
      'the strongest single driver of RHSI.',
    how: 'Day/night population ratio; the log-ratio of daytime population on hot vs mild days; the share of the dong ' +
      'within reach of a subway station; bus stops and parking spaces per km².',
    space: 'Dong · 422', time: 'Static (from 2024)', source: 'Seoul Open Data Plaza · Seoul Metro',
    vars: ['dnpr', 'delta_daypop', 'subway_access_coverage', 'bus_stop_density', 'parking_capacity'],
    links: [SEOUL, METRO],
  },
  {
    id: 'salesmix', role: 'Explanation', title: 'Sales Composition', file: 'Urban_Features.csv', kind: 'project',
    description: 'The retail make-up of a neighbourhood: how much of its card spending goes to retail, dining, everyday ' +
      'shops, general and large-format stores.',
    how: 'Each sector’s card-sales amount ÷ the dong’s total card-sales amount over 2024.',
    space: 'Dong · 422', time: 'Aggregated 2024', source: 'Seoul AI Foundation (processed)',
    vars: ['retail_share', 'dinebev_share_all', 'everyday_retail_share_all', 'general_share_all', 'large_format_share_all'],
  },
  {
    id: 'shap', role: 'Explanation', title: 'SHAP Contributions', file: 'shap_result.csv', kind: 'project',
    description: 'For each neighbourhood, how much each model input pushed its predicted RHSI up or down. It explains ' +
      'the model’s behaviour, not cause and effect.',
    how: 'SHAP values of a model predicting RHSI from 25 neighbourhood features; the app shows the three strongest.',
    space: 'Dong · 422', time: 'Static', source: 'UHUS model output',
    vars: ['shap_delta_daypop', 'shap_dnpr', 'shap_land_price'],
  },
  {
    id: 'geometry', role: 'Base', title: 'Dong Boundaries', file: 'Administrative_Dong_Geometry.geojson', kind: 'public',
    description: 'The 422 administrative neighbourhood (dong) boundaries every variable is mapped and joined on; the 25 ' +
      'districts (gu) are their union.',
    how: 'Simplified for the web; dong codes join every dataset above.',
    space: 'Dong · 422 / Gu · 25', time: 'Static', source: 'Seoul Open Data Plaza', vars: [], links: [SEOUL],
  },
];

export const KIND_LABEL: Record<SourceKind, string> = {public: 'Public', project: 'Project', restricted: 'Restricted'};
