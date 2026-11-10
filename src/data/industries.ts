import {VAR_BY_KEY} from './catalog';
import {displayNameOf} from './uhus';

// The 84 industries of card sales (catalog INDUSTRIES; scripts/build-industries.mjs writes one
// file each). All of them on the daily tables at once would be 84 columns over 154k rows —
// 13 million cells — so an industry's file loads the first time it goes on the map, and its
// column is added to the daily tables (gu_daily, dong_daily) from then on.
type IndustryFile = {dong: Record<string, number[]>; gu: Record<string, number[]>};
// A file's days run from 1 January of its year: 2024 for the industries and the 2024 datasets; a
// dataset over many years (catalog `years`) has a file a year. Loaded files by variable and year.
const BASE_YEAR = 2024;
const loaded = new Map<string, Map<number, IndustryFile>>();
const pending = new Map<string, Promise<void>>();
const DAY = 86400000;

export const isIndustry = (key: string) => !!VAR_BY_KEY[key]?.industry;
// loaded on demand: an industry, or a public daily dataset of the same shape (catalog `file`)
export const isOnDemand = (key: string) => isIndustry(key) || !!VAR_BY_KEY[key]?.file;
const fileOf = (key: string, year: number) =>
  (VAR_BY_KEY[key]?.file ?? `/data/industry/${key}.json`).replace('{year}', String(year));

// The years beyond the daily tables' own (2024) they carry rows for: those the time ruler's period
// touches (Overlay sets them as it moves), so the tables stay a year or two long, not twelve.
let activeYears: number[] = [];
export function setActiveYears(years: number[]) {
  const next = years.filter((y) => y !== BASE_YEAR).sort((a, b) => a - b);
  if (next.join() === activeYears.join()) return false;
  activeYears = next;
  return true;
}
// the years a variable has files for, within those asked
export const yearsOf = (key: string, years: number[]) => {
  const r = VAR_BY_KEY[key]?.years;
  return r ? years.filter((y) => y >= r[0] && y <= r[1]) : [];
};

// A place's own value — RHSI, a share — joined onto the daily tables too once a filter is
// set on it: kepler filters each table on its own columns, so only then does the filter
// reach the daily rows (the bubbles, kepler's own time chart). By place code, every day alike.
type Areas = {fields: any[]; rows: any[][]};
const statics = new Map<string, Record<'gu' | 'dong', Map<string, unknown>>>();
export function joinStatic(key: string, areas: Record<'gu' | 'dong', Areas | undefined>) {
  if (statics.has(key)) return false;
  const byCode = (t: Areas | undefined, codeName: string) => {
    const k = t?.fields.findIndex((f) => f.name === key) ?? -1, c = t?.fields.findIndex((f) => f.name === codeName) ?? -1;
    return new Map<string, unknown>(k < 0 || c < 0 ? [] : t!.rows.map((r) => [String(r[c]), r[k]]));
  };
  statics.set(key, {gu: byCode(areas.gu, 'gu_code'), dong: byCode(areas.dong, 'dong_code')});
  return true;
}
// what the daily tables carry beyond their own: the industries loaded and the values joined
export const dailyExtras = () => [...loaded.keys(), ...statics.keys()];

// Each variable's 2024 file, and — for one over many years — its files for the active years too
export function loadIndustries(keys: string[]): Promise<void> {
  const wanted = keys.filter(isOnDemand).flatMap((k) => [BASE_YEAR, ...yearsOf(k, activeYears)].map((y) => [k, y] as const));
  return Promise.all(wanted.filter(([k, y]) => !loaded.get(k)?.has(y)).map(([k, y]) => {
    const id = `${k}@${y}`;
    if (!pending.has(id)) {
      pending.set(id, fetch(fileOf(k, y))
        .then((r) => {
          if (!r.ok) throw new Error(`${k} ${y}: HTTP ${r.status}`);
          return r.json() as Promise<IndustryFile>;
        })
        .then((file) => { (loaded.get(k) ?? loaded.set(k, new Map()).get(k)!).set(y, file); })
        .finally(() => pending.delete(id)));
    }
    return pending.get(id)!;
  })).then(() => undefined);
}

// a variable's value for a place on a day, from the file of that day's year
const valueOn = (key: string, level: 'gu' | 'dong', place: string, t: number) => {
  const y = new Date(t).getUTCFullYear();
  const file = loaded.get(key)?.get(y)?.[level];
  return file?.[place]?.[Math.round((t - Date.UTC(y, 0, 1)) / DAY)] ?? null;
};
const dayOf = (date: unknown) => Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`);
// the columns an added year's rows copy from the place's own rows; every other one is left empty
const PLACE_COLUMNS = new Set(['gu_name', 'gu_code', 'dong_name', 'dong_code', 'lat', 'lng', 'h3']);
// The rows an active year adds, per level: a place × day for each day any loaded variable has that
// year (a dong only if one of them has it) — Overlay compares it with the table on the map
function addedDays(level: 'gu' | 'dong') {
  const out: {year: number; places: Set<string>; days: number}[] = [];
  for (const year of activeYears) {
    const places = new Set<string>();
    let days = 0;
    for (const years of loaded.values()) {
      const f = years.get(year)?.[level];
      if (!f) continue;
      for (const [code, arr] of Object.entries(f)) { places.add(code); days = Math.max(days, arr.length); }
    }
    if (places.size) out.push({year, places, days});
  }
  return out;
}
export const addedRowCount = (level: 'gu' | 'dong') => addedDays(level).reduce((s, y) => s + y.places.size * y.days, 0);
// the years of the added rows, first and last (a table with the right count may hold another year's)
export const addedYearSpan = (level: 'gu' | 'dong') => {
  const ys = addedDays(level).map((y) => y.year);
  return ys.length ? [ys[0], ys[ys.length - 1]] as const : null;
};

// A daily table (kepler's {fields, rows}) with a column for every industry loaded so far, and
// every place value joined, that it lacks — matched by place code (and day, for an industry).
// `level` says whose values: districts or dongs.
// The active years beyond 2024 add rows of their own: each copies its place's columns from the
// place's first row, takes its date, and leaves the rest empty — no weather or sales those years.
export function withIndustries<T extends {fields: any[]; rows: any[][]}>(table: T, level: 'gu' | 'dong'): T {
  const keys = dailyExtras().filter((k) => !table.fields.some((f) => f.name === k));
  const added = addedDays(level);
  if (!keys.length && !added.length) return table;
  const code = table.fields.findIndex((f) => f.name === (level === 'gu' ? 'gu_code' : 'dong_code'));
  const date = table.fields.findIndex((f) => f.name === 'date');
  const cell = keys.map((k) => {
    if (loaded.has(k)) return (place: string, t: number) => valueOn(k, level, place, t);
    const values = statics.get(k)![level];
    return (place: string) => values.get(place) ?? null;
  });
  const rows = table.rows.map((r) => {
    const t = dayOf(r[date]);
    return [...r, ...cell.map((c) => c(String(r[code]), t))];
  });
  if (added.length) {
    const first = new Map<string, any[]>();
    for (const r of table.rows) if (!first.has(String(r[code]))) first.set(String(r[code]), r);
    const keep = table.fields.map((f) => PLACE_COLUMNS.has(f.name));
    for (const {year, places, days} of added) {
      for (const place of places) {
        const r0 = first.get(place);
        if (!r0) continue;
        const own = r0.map((v, i) => (keep[i] ? v : null));
        for (let i = 0; i < days; i++) {
          const t = Date.UTC(year, 0, 1) + i * DAY;
          const row = own.slice();
          row[date] = `${new Date(t).toISOString().slice(0, 10)} 00:00:00`;
          rows.push([...row, ...cell.map((c) => c(place, t))]);
        }
      }
    }
  }
  const fields = [...table.fields, ...keys.map((name) =>
    ({name, type: 'real', format: '', analyzerType: 'FLOAT', displayName: displayNameOf(name)}))];
  return {...table, fields, rows};
}

// the daily tables as first built, without industries, to rebuild them from as more load
const bases: Partial<Record<'gu' | 'dong', {fields: any[]; rows: any[][]}>> = {};
export function setDailyBase(level: 'gu' | 'dong', table: {fields: any[]; rows: any[][]}) {
  bases[level] = table;
}
export const dailyBase = (level: 'gu' | 'dong') => bases[level];

// An industry's year for one place, read from its file (loaded first): a dong's or a
// district's own, all of Seoul the sum of its districts. Null until the file is in.
export function industrySeries(key: string, level: 'gu' | 'dong' | 'seoul', code: string | null): number[] | null {
  const file = loaded.get(key)?.get(BASE_YEAR);
  if (!file) return null;
  if (level !== 'seoul') return file[level][code ?? ''] ?? null;
  const all = Object.values(file.gu);
  return all[0] ? all[0].map((_, i) => all.reduce((s, v) => s + (v[i] || 0), 0)) : null;
}

// A variable's days from..to (UTC midnights, `to` left out) out of its year files loaded, one row
// per place of the level; NaN where a day's year is not loaded. The dashboard's daily panel reads
// it over the time ruler's period (the years beyond 2024 load as Overlay moves the period).
export function dailyOver(key: string, level: 'gu' | 'dong', from: number, to: number): Map<string, number[]> {
  const n = Math.max(0, Math.round((to - from) / DAY)), out = new Map<string, number[]>();
  const files = loaded.get(key);
  for (let i = 0; i < n; i++) {
    const t = from + i * DAY, y = new Date(t).getUTCFullYear(), rows = files?.get(y)?.[level];
    if (!rows) continue;
    const at = Math.round((t - Date.UTC(y, 0, 1)) / DAY);
    for (const code in rows) {
      const v = rows[code][at];
      (out.get(code) ?? out.set(code, new Array(n).fill(NaN)).get(code)!)[i] = typeof v === 'number' ? v : NaN;
    }
  }
  return out;
}
