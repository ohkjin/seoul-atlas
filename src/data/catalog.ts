// Every variable the dashboard can show, grouped into the six bottom-bar themes.
// `short` is what fits a drawer row (~110px); `full` and `source` go in the ⓘ card.
// Everything that changes day by day says so in its name: "(daily)".
// Labels, units and sources come from the old atlas' VARIABLE_META.

import {KEPLER_COLOR_PALETTES, colorPaletteToColorRange} from '@kepler.gl/constants';

export type ThemeKey = 'environment' | 'people' | 'urban' | 'economy' | 'mobility' | 'insights';
// dong: static, per neighbourhood (rolled up per district under Gu detail)
// gu_daily: daily, per district only (none at the moment — everything daily has dong rows)
// dong_daily: daily, per neighbourhood — and per district in gu_daily under Gu detail
export type DatasetId = 'dong' | 'gu_daily' | 'dong_daily';

export type Variable = {
  key: string;
  theme: ThemeKey;
  dataset: DatasetId;
  short: string;
  // the name in full, for the wide places (the Focus card, the dashboard's titles), where the
  // short one is an acronym
  long?: string;
  full: string;
  unit: string;
  source: string;
  how: 'mean' | 'sum';      // how a gu / Seoul value is built from finer rows
  signed?: boolean;         // diverging colour ramp (negative ↔ positive)
  // the folder it sits in, under another variable of its theme: an industry under its
  // sector's sales, a SHAP contribution under RHSI
  parent?: string;
  // one of the 84 industries of card sales: its column is loaded on demand (industries.ts)
  industry?: boolean;
  // a sum of other variables, worked out per neighbourhood when the data loads (uhus.ts)
  sumOf?: string[];
};

export const THEMES: {key: ThemeKey; label: string}[] = [
  {key: 'environment', label: 'Environment'},
  {key: 'people', label: 'People'},
  {key: 'urban', label: 'Urban Form'},
  {key: 'economy', label: 'Economy'},
  {key: 'mobility', label: 'Mobility'},
  {key: 'insights', label: 'Insights'}
];

const v = (key: string, theme: ThemeKey, dataset: DatasetId, short: string, full: string,
  unit: string, source: string, how: 'mean' | 'sum' = 'mean', signed = false): Variable =>
  ({key, theme, dataset, short, full, unit, source, how, signed});

export const VARIABLES: Variable[] = [
  // daily weather per dong (UHUS Daily_Weather); per district = the mean of its dongs
  v('temp_max', 'environment', 'dong_daily', 'Max temperature (daily)', 'Daily maximum air temperature', '°C', 'KMA, 2024 daily'),
  v('apptemp_max', 'environment', 'dong_daily', 'Apparent max temp (daily)', 'Daily maximum apparent temperature (KMA summer formula) — the heat-day measure', '°C', 'KMA, 2024 daily'),
  v('humid_max', 'environment', 'dong_daily', 'Max humidity (daily)', 'Daily maximum relative humidity', '%', 'KMA, 2024 daily'),
  v('precip_sum', 'environment', 'dong_daily', 'Precipitation (daily)', 'Daily total precipitation', 'mm', 'KMA, 2024 daily'),
  v('n_hot_days', 'environment', 'dong', 'Heat days', 'Number of heat days (apparent temp ≥ 33°C)', 'days', 'KMA, 2024'),
  v('n_mild_days', 'environment', 'dong', 'Mild days', 'Number of mild days (apparent temp 18–26°C, dry, non-holiday)', 'days', 'KMA, 2024'),

  v('elderly_share', 'people', 'dong', 'Elderly', 'Share of elderly population', 'ratio', 'Seoul Open Data Portal'),
  v('low_income_share', 'people', 'dong', 'Low income', 'Share of low-income population', 'ratio', 'Seoul Open Data Portal'),
  v('dnpr', 'people', 'dong', 'Day / night pop.', 'Daytime-to-nighttime population ratio', 'ratio', 'Seoul Open Data Portal'),

  v('residential_area_share', 'urban', 'dong', 'Residential', 'Residential land-use proportion', 'ratio', 'EGIS'),
  v('commercial_area_share', 'urban', 'dong', 'Commercial', 'Commercial land-use proportion', 'ratio', 'EGIS'),
  v('leisure_area_share', 'urban', 'dong', 'Leisure', 'Leisure / recreation land-use proportion', 'ratio', 'EGIS'),
  v('transportation_area_share', 'urban', 'dong', 'Transport land', 'Transportation land-use proportion', 'ratio', 'EGIS'),
  v('public_facility_area_share', 'urban', 'dong', 'Public facility', 'Public / institutional land-use proportion', 'ratio', 'EGIS'),
  v('green_space_share', 'urban', 'dong', 'Green space', 'Vegetation / open-space proportion', 'ratio', 'EGIS'),
  v('aged_housing_share', 'urban', 'dong', 'Aged housing', 'Share of old housing stock', 'ratio', 'MOLIT'),
  v('activity_facility_density', 'urban', 'dong', 'Activity venues', 'Density of activity-generating facilities', 'per km²', 'Seoul Open Data Portal'),
  v('land_price', 'urban', 'dong', 'Land price', 'Land value intensity — log of mean official land price', 'log KRW/m²', 'MOLIT'),

  v('retail_total_amount', 'economy', 'dong_daily', 'Retail sales (daily)', 'Daily retail card-sales amount', 'KRW', 'Seoul AI Foundation, 2024 daily', 'sum'),
  // card sales by industry group, per neighbourhood and day (the old atlas' six groups)
  v('sales_fnb', 'economy', 'dong_daily', 'F&B (daily)', 'Daily card sales — Food & Beverage', 'KRW', 'Seoul AI Foundation, 2024 daily', 'sum'),
  v('sales_retail', 'economy', 'dong_daily', 'Retail & goods (daily)', 'Daily card sales — Retail & Daily Goods', 'KRW', 'Seoul AI Foundation, 2024 daily', 'sum'),
  v('sales_fashion', 'economy', 'dong_daily', 'Fashion & beauty (daily)', 'Daily card sales — Fashion / Beauty', 'KRW', 'Seoul AI Foundation, 2024 daily', 'sum'),
  v('sales_health', 'economy', 'dong_daily', 'Health & culture (daily)', 'Daily card sales — Health / Edu / Culture', 'KRW', 'Seoul AI Foundation, 2024 daily', 'sum'),
  v('sales_leisure', 'economy', 'dong_daily', 'Leisure & travel (daily)', 'Daily card sales — Leisure / Mobility / Lodging', 'KRW', 'Seoul AI Foundation, 2024 daily', 'sum'),
  v('sales_housing', 'economy', 'dong_daily', 'Housing & services (daily)', 'Daily card sales — Housing / Professional / Local', 'KRW', 'Seoul AI Foundation, 2024 daily', 'sum'),
  v('retail_share', 'economy', 'dong', 'Retail share', 'Retail-sector card share among all sectors', 'ratio', 'Seoul AI Foundation'),
  v('dinebev_share_all', 'economy', 'dong', 'Dining share', 'Dining & beverage share among all sectors', 'ratio', 'Seoul AI Foundation'),
  v('everyday_retail_share_all', 'economy', 'dong', 'Everyday retail', 'Everyday retail share among all sectors', 'ratio', 'Seoul AI Foundation'),
  v('general_share_all', 'economy', 'dong', 'General retail', 'General retail share among all sectors', 'ratio', 'Seoul AI Foundation'),
  v('large_format_share_all', 'economy', 'dong', 'Large format', 'Large-format retail share among all sectors', 'ratio', 'Seoul AI Foundation'),
  // the same four shares within retail alone (UHUS Urban_Features)
  v('dinebev_share_retail', 'economy', 'dong', 'Dining share (retail)', 'Dining & beverage share within retail', 'ratio', 'Seoul AI Foundation'),
  v('everyday_retail_share_retail', 'economy', 'dong', 'Everyday retail (retail)', 'Everyday retail share within retail', 'ratio', 'Seoul AI Foundation'),
  v('general_share_retail', 'economy', 'dong', 'General retail (retail)', 'General retail share within retail', 'ratio', 'Seoul AI Foundation'),
  v('large_format_share_retail', 'economy', 'dong', 'Large format (retail)', 'Large-format retail share within retail', 'ratio', 'Seoul AI Foundation'),

  v('subway_access_coverage', 'mobility', 'dong', 'Subway access', 'Spatial accessibility to subway stations', 'ratio', 'Seoul Metro'),
  v('bus_stop_density', 'mobility', 'dong', 'Bus stops', 'Density of bus stops', 'per km²', 'Seoul Open Data Portal'),
  v('parking_capacity', 'mobility', 'dong', 'Parking', 'Parking infrastructure intensity', 'per km²', 'Seoul Open Data Portal'),
  v('delta_daypop', 'mobility', 'dong', 'Heat pop. shift', 'Daytime-population response, hot vs mild days', 'log-ratio', 'Seoul Open Data Portal', 'mean', true),

  {...v('RHSI_retail', 'insights', 'dong', 'RHSI', 'Retail Heat Sensitivity Index — log-ratio of mean retail sales on hot vs mild days', 'log-ratio', 'UHUS analysis, 2024', 'mean', true),
    long: 'RHSI (Retail Heat Sensitivity Index)'}
];

// What explains RHSI: the UHUS model's SHAP contribution of each of its 25 inputs, per
// neighbourhood (UHUS shap_result) — the model's RHSI is a base value plus the 25 of them.
// They sit in six folders by kind of input; each folder's head is the group's summed
// contribution, a variable of its own (the same groups as the dashboard's SHAP panel).
export const SHAP_GROUPS: {key: string; label: string; inputs: string[]}[] = [
  {key: 'shap_g_sales', label: 'Sales mix', inputs: ['dinebev_share_all', 'everyday_retail_share_all', 'general_share_all',
    'large_format_share_all', 'dinebev_share_retail', 'everyday_retail_share_retail', 'general_share_retail',
    'large_format_share_retail', 'retail_share']},
  {key: 'shap_g_people', label: 'People', inputs: ['elderly_share', 'low_income_share', 'dnpr', 'delta_daypop']},
  {key: 'shap_g_mobility', label: 'Mobility', inputs: ['subway_access_coverage', 'bus_stop_density', 'parking_capacity']},
  {key: 'shap_g_landuse', label: 'Land use', inputs: ['residential_area_share', 'commercial_area_share', 'leisure_area_share',
    'transportation_area_share', 'public_facility_area_share', 'green_space_share']},
  {key: 'shap_g_built', label: 'Built form', inputs: ['activity_facility_density', 'aged_housing_share']},
  {key: 'shap_g_price', label: 'Land price', inputs: ['land_price']}
];
const inputs = Object.fromEntries(VARIABLES.map((x) => [x.key, x]));
for (const g of SHAP_GROUPS) {
  VARIABLES.push({...v(g.key, 'insights', 'dong', `SHAP · ${g.label}`,
    `Summed SHAP contribution of the ${g.inputs.length} ${g.label.toLowerCase()} inputs to RHSI`, 'SHAP', 'UHUS model',
    'mean', true), sumOf: g.inputs.map((k) => `shap_${k}`)});
  for (const k of g.inputs) {
    VARIABLES.push({...v(`shap_${k}`, 'insights', 'dong', `SHAP · ${inputs[k].short}`,
      `SHAP contribution of ${inputs[k].full.charAt(0).toLowerCase()}${inputs[k].full.slice(1)} to RHSI`,
      'SHAP', 'UHUS model', 'mean', true), parent: g.key});
  }
}

// Card sales by industry, per neighbourhood and day: the 84 industries of UHUS sales, each in
// its sector's folder (the six sector totals above, the earlier atlas's grouping). Built per
// industry by scripts/build-industries.mjs; a column loads the first time it is shown.
export const INDUSTRIES: Record<string, [string, string][]> = {
  sales_fnb: [['korean_cuisine', 'Korean food'], ['japanese_cuisine', 'Japanese food'], ['western_cuisine', 'Western food'],
    ['chinese_cuisine', 'Chinese food'], ['bakery', 'Bakery'], ['cafe', 'Cafe'], ['fast_food', 'Fast food'],
    ['other_food', 'Other food'], ['other_food_service', 'Other food service'], ['liquor_store', 'Liquor store']],
  sales_retail: [['department_store', 'Department store'], ['supermarket_large_format', 'Hypermarket'],
    ['discount_store', 'Discount store'], ['shopping_mall', 'Shopping mall'], ['chain_grocery', 'Chain grocery'],
    ['independent_grocery', 'Local grocery'], ['convenience_store', 'Convenience store'],
    ['general_merchandise_imported', 'General & imported goods'], ['fresh_produce_seafood', 'Produce & seafood'],
    ['butcher_shop', 'Butcher'], ['home_appliances', 'Home appliances'], ['furniture', 'Furniture'],
    ['other_distribution', 'Other distribution'], ['chain_store', 'Chain store'], ['brand_exclusive_store', 'Brand store'],
    ['office_equipment_stationery', 'Office & stationery'], ['handmade_goods_store', 'Handmade goods'],
    ['gift_certificate_lottery', 'Gift cards & lottery']],
  sales_fashion: [['apparel', 'Apparel'], ['fashion_accessories', 'Fashion accessories'], ['watches_jewelry', 'Watches & jewelry'],
    ['cosmetics', 'Cosmetics'], ['hair_salon', 'Hair salon'], ['beauty_service', 'Beauty service'], ['massage_spa', 'Massage & spa'],
    ['sauna_bathhouse', 'Sauna'], ['laundry_dry_cleaner', 'Laundry'], ['door_to_door_mlm_sales', 'Door-to-door sales']],
  sales_health: [['pharmacy', 'Pharmacy'], ['general_hospital', 'General hospital'], ['general_clinic', 'Clinic'],
    ['dental_clinic', 'Dentist'], ['korean_medicine_clinic', 'Korean medicine'], ['public_health_center', 'Public health center'],
    ['other_medical', 'Other medical'], ['veterinary_clinic', 'Veterinary'], ['academy_learning_materials', 'Academies'],
    ['school_tuition', 'School tuition'], ['study_room', 'Study room'], ['kindergarten', 'Kindergarten'], ['books', 'Books'],
    ['bookstore', 'Bookstore'], ['cultural_goods', 'Cultural goods'], ['movie_performance', 'Movies & shows'],
    ['instruments_records', 'Music & records'], ['computer_software', 'Computers & software']],
  sales_leisure: [['gym', 'Gym'], ['sports_facility', 'Sports facility'], ['sports_leisure_goods', 'Sports goods'],
    ['indoor_outdoor_golf', 'Golf'], ['leisure_town_amusement_park', 'Amusement park'], ['game_room_arcade', 'Arcade'],
    ['karaoke', 'Karaoke'], ['entertainment_venue', 'Nightlife'], ['motel_inn_other_lodging', 'Motel & inn'],
    ['hotel_condo', 'Hotel & condo'], ['gas_station', 'Gas station'], ['parking_lot', 'Parking lot'],
    ['auto_service', 'Auto service'], ['auto_accessories', 'Auto parts'], ['used_car_dealer', 'Used cars'],
    ['motorcycle', 'Motorcycles'], ['toys_kids_bicycles', 'Toys & bicycles'], ['lpg_gas', 'LPG gas']],
  sales_housing: [['real_estate_agency', 'Real estate agency'], ['interior_building_materials_kitchenware', 'Interior & kitchen'],
    ['legal_office_service', 'Legal services'], ['accounting_patent_service', 'Accounting & patents'],
    ['research_translation_service', 'Research & translation'], ['wedding_hall_service', 'Wedding hall'],
    ['funeral_home_cemetery', 'Funeral & cemetery'], ['pet_shop', 'Pet shop'], ['flower_shop', 'Flower shop'],
    ['used_goods_store', 'Secondhand goods']]
};
// each industry right after its sector's total, so a folder follows its head
for (const [sector, list] of Object.entries(INDUSTRIES)) {
  const at = VARIABLES.findIndex((x) => x.key === sector);
  VARIABLES.splice(at + 1, 0, ...list.map(([id, label]) => ({
    ...v(`${id}_amount`, 'economy', 'dong_daily', `${label} (daily)`, `Daily card sales — ${label}`, 'KRW',
      'Seoul AI Foundation, 2024 daily', 'sum'),
    parent: sector, industry: true})));
}

export const VAR_BY_KEY = Object.fromEntries(VARIABLES.map((x) => [x.key, x])) as Record<string, Variable>;
export const varsOf = (theme: ThemeKey) => VARIABLES.filter((x) => x.theme === theme);
// a folder's contents, and a theme's variables outside any folder: those standing alone
// first, then the folder heads
export const childrenOf = (key: string) => VARIABLES.filter((x) => x.parent === key);
const heads = new Set(VARIABLES.filter((x) => x.parent).map((x) => x.parent));
export const topVarsOf = (theme: ThemeKey) => {
  const top = varsOf(theme).filter((x) => !x.parent);
  return [...top.filter((x) => !heads.has(x.key)), ...top.filter((x) => heads.has(x.key))];
};
export const INDUSTRY_KEYS = VARIABLES.filter((x) => x.industry).map((x) => x.key);
export const isTemporal = (x: Variable) => x.dataset !== 'dong';
// The six industry groups, in the order of the g arrays in *_group_daily.json.
export const SALES_GROUP_KEYS = ['sales_fnb', 'sales_retail', 'sales_fashion', 'sales_health', 'sales_leisure', 'sales_housing'];

// Every map layer this app creates for one variable is named after it (v:key), so a
// kepler layer maps back to its catalog entry. Two variables sharing one layer are the
// pair layer (bi:A:B, see overlay/pair.ts).
export const layerIdOf = (key: string) => `v:${key}`;
// In 3D a daily variable is drawn as hexagonal columns instead of points: layer c:key.
export const columnIdOf = (key: string) => `c:${key}`;
// In 3D a static variable is drawn as a stipple of small H3 columns: layer h:key.
export const cellIdOf = (key: string) => `h:${key}`;
export const varOfLayerId = (id: string) =>
  (id.startsWith('v:') || id.startsWith('c:') || id.startsWith('h:') ? VAR_BY_KEY[id.slice(2)] : undefined);

// The dark line between areas, shared by every area layer (here and pair.ts). Chosen from
// a side-by-side of 0.5–0.8px (mockups/border-lines.png, option B).
export const AREA_STROKE = {stroked: true, strokeColor: [14, 16, 20], strokeOpacity: 0.8, thickness: 0.6};

// One kepler layer (saved-map v1 format) for a variable — the same shape mapConfig uses,
// so addLayer can parse it with kepler's own config loader. Colours: colorRangeFor.
export function layerConfigFor(x: Variable, isVisible = true) {
  if (isTemporal(x)) {
    return {
      id: layerIdOf(x.key), type: 'point',
      config: {dataId: 'gu_daily', label: x.short, columns: {lat: 'lat', lng: 'lng'}, isVisible,
        // ~5px on screen, with a white rim so the dots stay findable over any fill.
        visConfig: {radius: 20, opacity: 0.95, outline: true, thickness: 1.5, strokeColor: [255, 255, 255],
          colorRange: colorRangeFor(x)}},
      // quantile, as for the areas: equal-width bins put nearly every place's sales in the lowest
      visualChannels: {colorField: {name: x.key, type: 'real'}, colorScale: 'quantile'}
    };
  }
  // Height is pre-wired to the same variable as colour but stays OFF (enable3d: false);
  // the overlay raises it in 3D.
  return {
    id: layerIdOf(x.key), type: 'geojson',
    config: {dataId: 'dong', label: x.short, columns: {geojson: '_geojson'}, isVisible,
      visConfig: {opacity: 0.75, ...AREA_STROKE, filled: true, colorRange: colorRangeFor(x),
        enable3d: false, elevationScale: 5}},
    visualChannels: {colorField: {name: x.key, type: 'real'}, colorScale: 'quantile',
      heightField: {name: x.key, type: 'real'}, heightScale: 'linear'}
  };
}

// Each variable's colours, low to high: the higher, the deeper, in every theme. A variable
// whose colour is plain from what it is takes that colour (heat red, temperature blue to
// red, water blue, green space green; commercial land shares the economy's); the rest
// take their theme's. Red and orange are kept for heat. A signed variable runs blue below
// zero to red above, as temperature does. Mild days keep kepler's default, as before.
const THEME_PALETTE: Record<ThemeKey, string> = {environment: 'YlOrRd', people: 'Purples', urban: 'YlOrBr',
  economy: 'PuBuGn', mobility: 'Blues', insights: 'PuBuGn'};
const OWN_PALETTE: Record<string, string> = {temp_max: 'RdBu', apptemp_max: 'RdBu', humid_max: 'Blues', precip_sum: 'Blues',
  n_hot_days: 'YlOrRd', n_mild_days: 'Global Warming', green_space_share: 'Greens', commercial_area_share: 'PuBuGn'};
// kepler lists RdBu red first
const REVERSED = new Set(['RdBu']);
// these end in a step too dark to stand off the near-black basemap: a step more is fetched
// and the darkest dropped (both ends of a diverging one)
const LIFTED = new Set(['Purples', 'YlOrBr', 'Blues', 'Greens', 'RdBu']);
const DIVERGING = new Set(['RdBu']);

// a ramp that runs between two hues (blue to red) rather than pale to deep in one
export const isDivergingRamp = (x: Variable) => DIVERGING.has(x.signed ? 'RdBu' : OWN_PALETTE[x.key] ?? THEME_PALETTE[x.theme]);

export function colorRangeFor(x: Variable) {
  const name = x.signed ? 'RdBu' : OWN_PALETTE[x.key] ?? THEME_PALETTE[x.theme];
  if (!LIFTED.has(name)) return paletteRange(name, 6, REVERSED.has(name));
  const both = DIVERGING.has(name);
  const range = paletteRange(name, both ? 8 : 7, REVERSED.has(name));
  return range && {...range, colors: range.colors.slice(both ? 1 : 0, both ? 7 : 6)};
}

// A daily variable in 3D (c:key): a bubble per place, coloured and sized by its value.
// kepler cannot raise its points, and a raised area would need its heights rebuilt every
// day (a new dataset, 60–140 ms a step) — hexagon columns did stand up, but read as a
// forest of bars; the bubbles lie on the tilted map instead.
export function columnConfigFor(x: Variable, dataId: string) {
  return {
    id: columnIdOf(x.key), type: 'point',
    config: {dataId, label: x.short, columns: {lat: 'lat', lng: 'lng'}, isVisible: true,
      // kepler's zoom-14 radius units: ~1.5–6 px for 422 neighbourhoods, ~6–22 px for 25 districts
      visConfig: {opacity: 0.9, radiusRange: dataId === 'dong_daily' ? [6, 26] : [24, 90], outline: false, filled: true,
        colorRange: colorRangeFor(x)}},
    visualChannels: {colorField: {name: x.key, type: 'real'}, colorScale: 'quantile',
      sizeField: {name: x.key, type: 'real'}, sizeScale: heightScaleFor(x)}
  };
}

// A static variable in 3D seen from afar (h:key): kepler's H3 layer on the areas' cells
// (uhus.ts cellsOf), lying flat on the ground — a hex grid in the same quantile colours as
// the areas, the cells a little apart so it reads as a fine stipple. Up close the raised
// areas take over (layers.ts cellView).
export function cellConfigFor(x: Variable, dataId: string) {
  return {
    id: cellIdOf(x.key), type: 'hexagonId',
    config: {dataId, label: x.short, columns: {hex_id: 'h3'}, isVisible: true,
      visConfig: {opacity: 0.9, coverage: 0.72, enable3d: false, colorRange: colorRangeFor(x)}},
    visualChannels: {colorField: {name: x.key, type: 'real'}, colorScale: 'quantile'}
  };
}

// Column heights: sales are heavily skewed — linear left all but a few columns flat — so
// totals rise by the square root; temperature, evenly spread, rises linearly.
// Rain is just as skewed (most days dry), so it rises by the square root too.
export const heightScaleFor = (x: Variable) => (x.how === 'sum' || x.key === 'precip_sum' ? 'sqrt' : 'linear');

// One of kepler's own palettes as a layer colour range.
export const paletteRange = (name: string, steps = 6, reversed = false) => {
  const palette = KEPLER_COLOR_PALETTES.find((c) => c.name === name);
  return palette ? colorPaletteToColorRange(palette, {steps, reversed}) : undefined;
};
