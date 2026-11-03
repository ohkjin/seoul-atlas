// Shared helpers for the public-data build scripts (build-subway, build-bus, build-bike, build-livepop).
// Their raw files are Seoul Open Data Plaza downloads kept outside the repo, in ../raw-public/<dataset>/.
// Every script writes the industry shape (build-industries.mjs), one file per variable:
//   public/data/opendata/<variable>.json  { dong: { [dong_code]: [366] }, gu: { [gu_code]: [366] } }
// District values are the sum of their dongs.
import fs from 'node:fs';
import zlib from 'node:zlib';

export const RAW = '../raw-public';
export const OUT = 'public/data/opendata';

// 2024 is the atlas's year: day i of the daily arrays is 2024-01-01 + i
export const DAYS = 366;
const START = Date.UTC(2024, 0, 1);
// '20240101' or '2024-01-01' → 0..365, or -1 outside 2024
export function dayOf(s) {
  const d = s.replace(/-/g, '');
  const i = Math.round((Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) - START) / 864e5);
  return i >= 0 && i < DAYS ? i : -1;
}
// A dataset that runs over many years writes one file per year (writeDailyYears), each indexed from
// its own 1 January: '20190305' → {year: 2019, i: 63}
export const daysIn = (year) => Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 864e5);
export function dayOfYear(s) {
  const d = s.replace(/-/g, '');
  const year = +d.slice(0, 4);
  return {year, i: Math.round((Date.UTC(year, +d.slice(4, 6) - 1, +d.slice(6, 8)) - Date.UTC(year, 0, 1)) / 864e5)};
}

// The portal mixes encodings, even within one dataset (CARD_SUBWAY_MONTH_202402.csv is CP949, the
// other months UTF-8): try UTF-8 first, fall back to CP949.
export function readText(file) {
  const buf = fs.readFileSync(file);
  let text;
  try {
    text = new TextDecoder('utf-8', {fatal: true}).decode(buf);
  } catch {
    text = new TextDecoder('euc-kr').decode(buf);
  }
  return text.replace(/^﻿/, '');
}

// One CSV line → fields. Quoted fields may hold commas (bus route names such as "관악01(호암방향, …)").
export function splitCsv(line) {
  if (!line.includes('"')) return line.split(',').map((f) => f.trim());
  const out = [];
  let f = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') f += line[++i];
      else if (c === '"') quoted = false;
      else f += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(f.trim());
      f = '';
    } else f += c;
  }
  out.push(f.trim());
  return out;
}

// Streams a large CSV line by line (the bus and bike months are 100–240 MB). Decodes as UTF-8
// unless `encoding` says otherwise.
export async function eachLine(file, encoding, fn) {
  const decoder = new TextDecoder(encoding);
  let rest = '';
  let n = 0;
  for await (const chunk of fs.createReadStream(file, {highWaterMark: 1 << 22})) {
    const text = rest + decoder.decode(chunk, {stream: true});
    const lines = text.split(/\r?\n/);
    rest = lines.pop();
    for (const l of lines) if (l) fn(n++ === 0 ? l.replace(/^﻿/, '') : l, n - 1);
  }
  if (rest) fn(rest, n);
}

// UTF-8 or CP949, from the first 64 KB
export function sniffEncoding(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1 << 16);
  const len = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  try {
    // cut at the last newline so a split multi-byte character does not fail the check
    new TextDecoder('utf-8', {fatal: true}).decode(buf.subarray(0, buf.lastIndexOf(10, len) + 1));
    return 'utf-8';
  } catch {
    return 'euc-kr';
  }
}

// ── Zip / xlsx ───────────────────────────────────────────────────────────────────────────────────
// The entries of a zip file: [{ name, data() → Buffer }]. Reads the central directory; deflate or stored.
export function zipEntries(file) {
  const buf = fs.readFileSync(file);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let k = 0; k < count; k++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const skip = nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    out.push({name, data: () => {
      const raw = buf.subarray(start, start + size);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    }});
    p += 46 + skip;
  }
  return out;
}

const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');
// The first sheet of an .xlsx as rows of strings (enough for the portal's flat tables).
export function readXlsx(file) {
  const entries = new Map(zipEntries(file).map((e) => [e.name, e]));
  const shared = entries.has('xl/sharedStrings.xml')
    ? [...entries.get('xl/sharedStrings.xml').data().toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)]
      .map((m) => unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
    : [];
  const sheet = entries.get('xl/worksheets/sheet1.xml').data().toString('utf8');
  const colIndex = (ref) => [...ref.replace(/\d/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells = [];
    for (const c of row[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = (c[3] ?? '').match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? (c[3] ?? '').match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      cells[colIndex(c[1])] = v === undefined ? '' : / t="s"/.test(c[2]) ? shared[+v] : unxml(v);
    }
    return Array.from(cells, (v) => v ?? '');
  });
}
// Some portal xlsx files store CP949 bytes as Latin-1 characters; undo that when it is the case.
export const fixMojibake = (s) => (/^[\x00-\xff]*$/.test(s) && /[\x80-\xff]/.test(s)
  ? new TextDecoder('euc-kr').decode(Buffer.from(s, 'latin1')) : s);

// ── Point → dong ─────────────────────────────────────────────────────────────────────────────────
const dongs = JSON.parse(fs.readFileSync('public/data/dong_geometry.json', 'utf8')).map((d) => {
  const ring = d.geometry.coordinates;
  const xs = ring[0].map((p) => p[0]);
  const ys = ring[0].map((p) => p[1]);
  return {dong: d.dong_code, gu: d.gu_code, rings: ring,
    box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]};
});
export const guOfDong = new Map(dongs.map((d) => [d.dong, d.gu]));

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// The dong a WGS84 point falls in, or null outside Seoul. Outer ring minus holes.
export function dongAt(lon, lat) {
  for (const d of dongs) {
    const [x0, y0, x1, y1] = d.box;
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    if (inRing(lon, lat, d.rings[0]) && !d.rings.slice(1).some((h) => inRing(lon, lat, h))) return d.dong;
  }
  return null;
}

// ── Output ───────────────────────────────────────────────────────────────────────────────────────
// dongDaily: Map dong_code → number[366]. Writes { dong, gu } with district = sum of its dongs.
function dailyOf(dongDaily) {
  const dong = {};
  const gu = {};
  for (const [code, arr] of [...dongDaily].sort(([a], [b]) => a.localeCompare(b))) {
    dong[code] = arr.map((v) => Math.round(v));
    const g = (gu[guOfDong.get(code)] ??= new Array(arr.length).fill(0));
    arr.forEach((v, i) => (g[i] += v));
  }
  for (const k of Object.keys(gu)) gu[k] = gu[k].map((v) => Math.round(v));
  return {dong, gu};
}
function writeText(path, value, what) {
  const text = JSON.stringify(value);
  fs.writeFileSync(path, text);
  console.log(`  ${path}  ${what}, ${(text.length / 1024).toFixed(0)} KB`);
}
export function writeDaily(name, dongDaily) {
  const {dong, gu} = dailyOf(dongDaily);
  fs.mkdirSync(OUT, {recursive: true});
  writeText(`${OUT}/${name}.json`, {dong, gu}, `${Object.keys(dong).length} dongs, ${Object.keys(gu).length} districts`);
}
// byYear: Map year → (Map dong_code → number[the year's days, from 1 January]). Writes one file a year,
//   public/data/opendata/<name>/<year>.json  { year, dong, gu }
// (catalog `file: …/<name>/{year}.json`, `years`; the app loads the years the time ruler's period touches)
export function writeDailyYears(name, byYear) {
  fs.mkdirSync(`${OUT}/${name}`, {recursive: true});
  for (const [year, dongDaily] of [...byYear].sort(([a], [b]) => a - b)) {
    const {dong, gu} = dailyOf(dongDaily);
    writeText(`${OUT}/${name}/${year}.json`, {year, dong, gu}, `${Object.keys(dong).length} dongs`);
  }
}

// The points the app draws for a dataset (src/overlay/stations.ts): every station, busiest first, with
// its 2024 totals, and the day-by-day values of the busiest `cap` — a map's worth of sized circles
// (more would put a million rows on kepler's time filter; the rest are drawn as specks). `sid` starts
// with the station's dong code, so a district's stations share its prefix.
//   public/data/opendata/stations_<name>.json
//   { fields, stations: [{ sid, name, lng, lat, total: {field: n} }], daily: { field: [[366] per busiest station] } }
export function writeStations(name, stations, fields, cap = 1100, extra = {}) {
  const total = (a) => a.reduce((s, v) => s + v, 0);
  const sorted = stations.filter((s) => s.dong).sort((a, b) => total(b.daily[fields[0]]) - total(a.daily[fields[0]]));
  writeJson(`stations_${name}`, {
    ...extra,
    fields,
    stations: sorted.map((s) => ({sid: `${s.dong}:${s.id}`, name: s.name, lng: +s.lon.toFixed(5), lat: +s.lat.toFixed(5),
      total: Object.fromEntries(fields.map((f) => [f, total(s.daily[f])]))})),
    daily: Object.fromEntries(fields.map((f) => [f, sorted.slice(0, cap).map((s) => s.daily[f].map((v) => Math.round(v)))])),
  });
}

export function writeJson(name, value) {
  fs.mkdirSync(OUT, {recursive: true});
  const text = JSON.stringify(value);
  fs.writeFileSync(`${OUT}/${name}.json`, text);
  console.log(`  ${OUT}/${name}.json  ${(text.length / 1024).toFixed(0)} KB`);
}
