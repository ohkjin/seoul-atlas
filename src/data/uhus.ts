import {processGeojson, processRowObject} from '@kepler.gl/processors';
import {geoToH3} from 'h3-js';
import {SALES_GROUP_KEYS, VARIABLES, VAR_BY_KEY} from './catalog';

const DONG_KEYS = VARIABLES.filter((x) => x.dataset === 'dong').map((x) => x.key);

type Ring = [number, number][];
type Geometry = {type: 'Polygon'; coordinates: Ring[]} | {type: 'MultiPolygon'; coordinates: Ring[][]};

type DongGeom = {gu_code: string; gu_name: string; dong_code: string; dong_name: string;
  centroid: [number, number]; geometry: Geometry};
type GuGeom = {gu_code: string; gu_name: string; centroid: [number, number]; geometry: Geometry};
type DongMetric = {dong_code: string} & Record<string, number | string | null>;
// daily weather + retail total (scripts/build-daily.mjs from the UHUS tables): v / each day's
// array follows `fields`
type GuDailyCore = {fields: string[]; gu: Record<string, {date: string; v: (number | null)[]}[]>; holidays?: string[]};
type DongDailyCore = {fields: string[]; dong: Record<string, (number | null)[][]>};
// card sales by six industry groups: g[i] is group i (catalog SALES_GROUP_KEYS order)
type GuGroupDaily = {groups: {id: string; label: string}[]; gu: Record<string, {date: string; g: number[]}[]>};
type DongGroupDaily = {dong: Record<string, number[][]>};   // one g array per day from 2024-01-01

export type Bounds = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
export type Place = {code: string; name: string; guCode: string; guName: string; bounds: Bounds;
  centre: [number, number]};   // [lng, lat]

export type UhusData = {
  holidays: Set<string>;   // 'YYYY-MM-DD' public holidays (mild days exclude them)
  dong: ReturnType<typeof processGeojson>;
  gu: ReturnType<typeof processGeojson>;      // dong variables rolled up per district
  guDaily: ReturnType<typeof processRowObject>;
  gus: Place[];
  dongs: Place[];
};

const fetchJson = <T,>(file: string): Promise<T> =>
  fetch(`/data/${file}`).then((r) => {
    if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
    return r.json() as Promise<T>;
  });

function boundsOf(geometry: Geometry): Bounds {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const rings: Ring[] = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}

// Region codes are identifiers, not numbers. kepler's type analyzer reads "11680" as an
// integer and the 10-digit dong codes as a unix TIMESTAMP — which broke code matching
// and would have offered dong_code as a time field. Force them back to text.
function keepAsText<T extends {fields: any[]; rows: any[][]}>(data: T, names: string[]): T {
  const cols = names.map((n) => data.fields.findIndex((f) => f.name === n)).filter((i) => i >= 0);
  for (const i of cols) data.fields[i] = {...data.fields[i], type: 'string', analyzerType: 'STRING', format: ''};
  for (const row of data.rows) for (const i of cols) if (row[i] != null) row[i] = String(row[i]);
  return data;
}

// Sales of ~3 billion won read to kepler's type analyzer as unix TIMESTAMPS (it typed
// retail_total_amount as a time field). They are amounts: force them to numbers.
// 3D draws the daily values as hexagonal columns (kepler's H3 layer) at each place's
// centre. The cell size keeps every place in a cell of its own: res 9 (~170 m edge) for
// the 422 dongs — res 8 already put 27 of them two to a cell — and res 7 for 25 districts.
export const H3_RES = {dong: 9, gu: 7};
function keepAsH3<T extends {fields: any[]}>(data: T, name: string): T {
  const i = data.fields.findIndex((f) => f.name === name);
  if (i >= 0) data.fields[i] = {...data.fields[i], type: 'h3', analyzerType: 'H3', format: ''};
  return data;
}

function keepAsReal<T extends {fields: any[]; rows: any[][]}>(data: T, names: string[]): T {
  const cols = names.map((n) => data.fields.findIndex((f) => f.name === n)).filter((i) => i >= 0);
  for (const i of cols) data.fields[i] = {...data.fields[i], type: 'real', analyzerType: 'FLOAT', format: ''};
  for (const row of data.rows) for (const i of cols) row[i] = row[i] == null ? null : Number(row[i]);
  return data;
}

// Daily weather and card sales per neighbourhood: 422 dongs × 366 days, placed at each
// dong's centre. 14MB together, so they load the first time a daily variable is shown
// under Dong detail — until then the district rows stand in. Built straight into kepler's

// The names kepler shows for our columns — in its field pickers, its filters and the map
// tooltip (kepler reads field.displayName and falls back to the raw name). Variables take
// their catalog name; the place columns are what kepler's users would call them, so its
// own tools read "District" and "Neighbourhood" instead of gu_name and dong_code.
const COLUMN_NAMES: Record<string, string> = {
  gu_name: 'District', gu_code: 'District code', dong_name: 'Neighbourhood', dong_code: 'Neighbourhood code',
  date: 'Date', lat: 'Latitude', lng: 'Longitude', h3: 'H3 cell', _geojson: 'Geometry',
  is_hot: 'Heat day', is_mild: 'Mild day'
};
export const displayNameOf = (name: string) => VAR_BY_KEY[name]?.short ?? COLUMN_NAMES[name] ?? name;
export function withDisplayNames<T extends {fields: any[]}>(table: T): T {
  table.fields = table.fields.map((f) => ({...f, displayName: displayNameOf(f.name)}));
  return table;
}

// field/row form: 154k rows are too many to type-guess.
export async function loadDongDaily(dongs: Place[]) {
  const [core, file] = await Promise.all([
    fetchJson<DongDailyCore>('dong_daily_core.json'),
    fetchJson<DongGroupDaily>('dong_group_daily.json')
  ]);
  const fields = [
    {name: 'gu_name', type: 'string', format: '', analyzerType: 'STRING'},
    {name: 'gu_code', type: 'string', format: '', analyzerType: 'STRING'},
    {name: 'dong_name', type: 'string', format: '', analyzerType: 'STRING'},
    {name: 'dong_code', type: 'string', format: '', analyzerType: 'STRING'},
    {name: 'date', type: 'timestamp', format: 'YYYY-M-D H:m:s', analyzerType: 'DATETIME'},
    {name: 'lat', type: 'real', format: '', analyzerType: 'FLOAT'},
    {name: 'lng', type: 'real', format: '', analyzerType: 'FLOAT'},
    {name: 'h3', type: 'h3', format: '', analyzerType: 'H3'},
    ...[...core.fields, ...SALES_GROUP_KEYS].map((name) => ({name, type: 'real', format: '', analyzerType: 'FLOAT'}))
  ];
  const day0 = Date.UTC(2024, 0, 1);
  const dates: string[] = [];
  const rows: any[][] = [];
  for (const d of dongs) {
    const days = core.dong[d.code];
    if (!days) continue;
    const sales = file.dong[d.code] || [];
    const cell = geoToH3(d.centre[1], d.centre[0], H3_RES.dong);
    days.forEach((v, i) => {
      dates[i] ??= `${new Date(day0 + i * 86400000).toISOString().slice(0, 10)} 00:00:00`;
      rows.push([d.guName, d.guCode, d.name, d.code, dates[i], d.centre[1], d.centre[0], cell, ...v,
        ...(sales[i] ?? SALES_GROUP_KEYS.map(() => null))]);
    });
  }
  return withDisplayNames({fields, rows});
}

export async function loadUhus(): Promise<UhusData> {
  const [dongGeom, dongMetrics, guGeom, guDaily, guGroups] = await Promise.all([
    fetchJson<DongGeom[]>('dong_geometry.json'),
    fetchJson<DongMetric[]>('dong_metrics.json'),
    fetchJson<GuGeom[]>('gu_geometry.json'),
    fetchJson<GuDailyCore>('gu_daily_core.json'),
    fetchJson<GuGroupDaily>('gu_group_daily.json')   // small (0.9MB); the per-dong file loads on demand
  ]);

  const metricByCode = new Map(dongMetrics.map((m) => [m.dong_code, m]));
  const dongFc = {
    type: 'FeatureCollection',
    features: dongGeom.map((d) => {
      // A dong with no metrics row still gets drawn, with empty values.
      const m: Partial<DongMetric> = metricByCode.get(d.dong_code) ?? {};
      return {
        type: 'Feature',
        geometry: d.geometry,
        properties: {
          gu_name: d.gu_name, dong_name: d.dong_name, dong_code: d.dong_code, gu_code: d.gu_code,
          // only catalogued variables travel to kepler; every one of them can become a layer
          ...Object.fromEntries(DONG_KEYS.map((k) => [k, m[k] ?? null]))
        }
      };
    })
  };

  // The same variables rolled up to the 25 districts, for the Gu map detail. Each one is
  // combined the way its catalogue entry says: rates and indices average, totals add up.
  const howOf = Object.fromEntries(VARIABLES.map((x) => [x.key, x.how]));
  const guFc = {
    type: 'FeatureCollection',
    features: guGeom.map((g) => {
      const rows = dongMetrics.filter((m) => String(m.gu_code) === g.gu_code);
      const props: Record<string, string | number | null> = {gu_name: g.gu_name, gu_code: g.gu_code};
      for (const k of DONG_KEYS) {
        const vals = rows.map((m) => m[k]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
        const total = vals.reduce((a, b) => a + b, 0);
        props[k] = vals.length ? (howOf[k] === 'sum' ? total : total / vals.length) : null;
      }
      return {type: 'Feature', geometry: g.geometry, properties: props};
    })
  };

  // One row per gu per day, placed at the gu centroid. kepler reads
  // "YYYY-MM-DD HH:mm:ss" as a timestamp field, which is what time playback needs.
  const guRows: Record<string, string | number>[] = [];
  for (const g of guGeom) {
    const sales = new Map((guGroups.gu[g.gu_code] || []).map((d) => [d.date, d.g]));
    for (const day of guDaily.gu[g.gu_code] || []) {
      const s = sales.get(day.date);
      guRows.push({
        gu_name: g.gu_name, gu_code: g.gu_code, date: `${day.date} 00:00:00`,
        ...Object.fromEntries(guDaily.fields.map((k, i) => [k, day.v[i]])),
        ...Object.fromEntries(SALES_GROUP_KEYS.map((k, i) => [k, s ? s[i] : null])),
        lat: g.centroid[1], lng: g.centroid[0], h3: geoToH3(g.centroid[1], g.centroid[0], H3_RES.gu)
      });
    }
  }

  return {
    holidays: new Set(guDaily.holidays ?? []),
    dong: withDisplayNames(keepAsText(processGeojson(dongFc as any) as any, ['gu_code', 'dong_code'])),
    gu: withDisplayNames(keepAsText(processGeojson(guFc as any) as any, ['gu_code'])),
    guDaily: withDisplayNames(keepAsH3(keepAsReal(keepAsText(processRowObject(guRows) as any, ['gu_code']),
      [...guDaily.fields, ...SALES_GROUP_KEYS]), 'h3')),
    gus: guGeom.map((g) => ({code: g.gu_code, name: g.gu_name, guCode: g.gu_code, guName: g.gu_name,
      bounds: boundsOf(g.geometry), centre: g.centroid})).sort((a, b) => a.name.localeCompare(b.name)),
    dongs: dongGeom.map((d) => ({code: d.dong_code, name: d.dong_name, guCode: d.gu_code, guName: d.gu_name,
      bounds: boundsOf(d.geometry), centre: d.centroid})).sort((a, b) => a.name.localeCompare(b.name))
  };
}
