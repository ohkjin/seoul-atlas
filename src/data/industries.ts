import {VAR_BY_KEY} from './catalog';
import {displayNameOf} from './uhus';

// The 84 industries of card sales (catalog INDUSTRIES; scripts/build-industries.mjs writes one
// file each). All of them on the daily tables at once would be 84 columns over 154k rows —
// 13 million cells — so an industry's file loads the first time it goes on the map, and its
// column is added to the daily tables (gu_daily, dong_daily) from then on.
type IndustryFile = {dong: Record<string, number[]>; gu: Record<string, number[]>};
const loaded = new Map<string, IndustryFile>();
const pending = new Map<string, Promise<void>>();

export const isIndustry = (key: string) => !!VAR_BY_KEY[key]?.industry;
export const industryLoaded = (key: string) => loaded.has(key);
export const loadedIndustries = () => [...loaded.keys()];

export function loadIndustries(keys: string[]): Promise<void> {
  return Promise.all(keys.filter((k) => isIndustry(k) && !loaded.has(k)).map((k) => {
    if (!pending.has(k)) {
      pending.set(k, fetch(`/data/industry/${k}.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`${k}: HTTP ${r.status}`);
          return r.json() as Promise<IndustryFile>;
        })
        .then((file) => { loaded.set(k, file); })
        .finally(() => pending.delete(k)));
    }
    return pending.get(k)!;
  })).then(() => undefined);
}

const DAY0 = Date.UTC(2024, 0, 1);

// A daily table (kepler's {fields, rows}) with a column for every industry loaded so far that
// it lacks, matched by place code and day. `level` says whose values: districts or dongs.
export function withIndustries<T extends {fields: any[]; rows: any[][]}>(table: T, level: 'gu' | 'dong'): T {
  const keys = [...loaded.keys()].filter((k) => !table.fields.some((f) => f.name === k));
  if (!keys.length) return table;
  const code = table.fields.findIndex((f) => f.name === (level === 'gu' ? 'gu_code' : 'dong_code'));
  const date = table.fields.findIndex((f) => f.name === 'date');
  const files = keys.map((k) => loaded.get(k)![level]);
  const rows = table.rows.map((r) => {
    const day = Math.round((Date.parse(`${String(r[date]).slice(0, 10)}T00:00:00Z`) - DAY0) / 86400000);
    return [...r, ...files.map((f) => f[String(r[code])]?.[day] ?? null)];
  });
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
  const file = loaded.get(key);
  if (!file) return null;
  if (level !== 'seoul') return file[level][code ?? ''] ?? null;
  const all = Object.values(file.gu);
  return all[0] ? all[0].map((_, i) => all.reduce((s, v) => s + (v[i] || 0), 0)) : null;
}
