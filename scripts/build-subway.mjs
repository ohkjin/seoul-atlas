// Builds daily subway boardings / alightings per dong from Seoul Open Data Plaza files (public, KOGL type 1):
//   ../raw-public/subway/CARD_SUBWAY_MONTH_<YYYY>.csv (2015–2022, a year each) and _<YYYYMM>.csv (2023 on, a month each)
//       OA-12914 서울시 지하철호선별 역별 승하차 인원 정보
//       사용일자, 노선명, 역명, 승차총승객수, 하차총승객수 — one row per station × line × day (transit-card taps)
//   ../raw-public/subway/station_master.csv            OA-21232 서울시 역사마스터 정보 (역사_ID, 역사명, 호선, 위도, 경도)
// Writes (public-data-lib.mjs shape)
//   public/data/opendata/subway_board/<year>.json, subway_alight/<year>.json   dong × the year's days, 2015–2026
//   public/data/opendata/subway_stations.json   [{ name, lines, lon, lat, dong, board, alight }] 2024 totals per station
//   public/data/opendata/stations_subway/<year>.json   the stations' points, a file a year (stations.ts)
// A station counts in the dong its point falls in; stations outside Seoul are dropped.
// Run from seoul-atlas-kepler/:  node scripts/build-subway.mjs
import fs from 'node:fs';
import {RAW, OUT, dayOfYear, daysIn, readText, splitCsv, dongAt, writeDailyYears, writeJson, writeStations} from './public-data-lib.mjs';

const DIR = `${RAW}/subway`;
// stations renamed since 2024: the daily files' name → the station master's
const RENAMED = {'당고개': '불암산', '자양': '뚝섬유원지'};
const name = (s) => {
  const n = s.replace(/\(.*?\)/g, '').replace(/\s/g, '');
  return RENAMED[n] ?? n;
};
// the daily files' line names → the station master's
const LINE = {'공항철도1호선': '공항철도1호선', '경의선': '경의중앙선', '9호선2~3단계': '9호선(연장)'};
const line = (s) => LINE[s.replace(/\s/g, '')] ?? s.replace(/\s/g, '');

// station master: name → [{ line, lon, lat }]
const master = new Map();
for (const r of readText(`${DIR}/station_master.csv`).trim().split(/\r?\n/).slice(1).map(splitCsv)) {
  const [, nm, ln, lat, lon] = r;
  (master.get(name(nm)) ?? master.set(name(nm), []).get(name(nm))).push({line: ln, lon: +lon, lat: +lat});
}
const km = (a, b) => Math.hypot((a.lon - b.lon) * 88.2, (a.lat - b.lat) * 111.0);
const mean = (list) => ({lon: list.reduce((s, p) => s + p.lon, 0) / list.length,
  lat: list.reduce((s, p) => s + p.lat, 0) / list.length});

// a station row's place: the same name on the same line; else the name alone when all its entries
// are one place (within 1 km — transfer stations); else unknown
function place(ln, nm) {
  const all = master.get(name(nm)) ?? (nm.endsWith('역') ? master.get(name(nm.slice(0, -1))) : undefined);
  if (!all) return null;
  const same = all.filter((p) => p.line === line(ln));
  if (same.length) return mean(same);
  return all.every((p) => km(p, all[0]) < 1) ? mean(all) : null;
}

// every year: year → station (name@dong) → { name, lines, lon, lat, dong, board[], alight[] }, the year's days from 1 January
const byYear = new Map();
const unplaced = new Map();   // 2024 boardings at stations with no place
let outside = 0;              // 2024 rows at stations outside Seoul
// the last day each year has data for: the latest year stops there (2026 runs to September), not at 31 December
const lastDay = new Map();
// a row's place and dong, worked out once per line × station name (null: no place)
const placeOf = new Map();
for (const f of fs.readdirSync(DIR).filter((f) => /^CARD_SUBWAY_MONTH_\d{4}(\d\d)?\.csv$/.test(f)).sort()) {
  const rows = readText(`${DIR}/${f}`).trim().split(/\r?\n/).slice(1).map(splitCsv);
  for (const [date, ln, nm, on, off] of rows) {
    if (!/^\d{8}$/.test(date)) continue;
    const k = `${ln}|${nm}`;
    if (!placeOf.has(k)) { const p = place(ln, nm); placeOf.set(k, p ? {p, dong: dongAt(p.lon, p.lat)} : null); }
    const at = placeOf.get(k);
    const {year, i} = dayOfYear(date);
    if (!at) {
      if (year === 2024) unplaced.set(`${ln} ${nm}`, (unplaced.get(`${ln} ${nm}`) ?? 0) + (+on || 0));
      continue;
    }
    if (!at.dong) {
      if (year === 2024) outside++;
      continue;
    }
    lastDay.set(year, Math.max(lastDay.get(year) ?? 0, i));
    const stations = byYear.get(year) ?? byYear.set(year, new Map()).get(year);
    const key = `${name(nm)}@${at.dong}`;
    const s = stations.get(key) ?? stations.set(key, {name: nm, lines: new Set(), lon: at.p.lon, lat: at.p.lat, dong: at.dong,
      board: new Array(daysIn(year)).fill(0), alight: new Array(daysIn(year)).fill(0)}).get(key);
    s.lines.add(ln);
    s.board[i] += +on || 0;
    s.alight[i] += +off || 0;
  }
}
for (const [year, stations] of byYear) {
  for (const s of stations.values()) { s.board = s.board.slice(0, lastDay.get(year) + 1); s.alight = s.alight.slice(0, lastDay.get(year) + 1); }
}

// a year's dongs: the sum of their stations
const dongsOf = (stations, field) => {
  const out = new Map();
  for (const s of stations.values()) {
    const arr = out.get(s.dong) ?? out.set(s.dong, new Array(s[field].length).fill(0)).get(s.dong);
    s[field].forEach((v, i) => (arr[i] += v));
  }
  return out;
};
const total = (arr) => arr.reduce((s, v) => s + v, 0);
const stations = byYear.get(2024);
console.log(`2024: ${stations.size} stations in Seoul, ${dongsOf(stations, 'board').size} dongs with a station; ${outside} rows outside Seoul`);
if (unplaced.size) {
  console.log(`${unplaced.size} station rows with no place (2024 boardings):`);
  for (const [k, v] of [...unplaced].sort((a, b) => b[1] - a[1])) console.log(`  ${k}  ${v}`);
}
console.log(`years ${[...lastDay.keys()].sort().join(', ')}; the last runs to ${[...lastDay].sort()[lastDay.size - 1].join(' day ')}`);
writeDailyYears('subway_board', new Map([...byYear].map(([y, st]) => [y, dongsOf(st, 'board')])));
writeDailyYears('subway_alight', new Map([...byYear].map(([y, st]) => [y, dongsOf(st, 'alight')])));
writeJson('subway_stations', [...stations.values()].map((s) => ({name: s.name, lines: [...s.lines],
  lon: +s.lon.toFixed(6), lat: +s.lat.toFixed(6), dong: s.dong, board: total(s.board), alight: total(s.alight)})));
// the points, a file a year (stations.ts loads the years the period touches); a station keeps its sid across years
fs.mkdirSync(`${OUT}/stations_subway`, {recursive: true});
for (const [year, st] of [...byYear].sort(([a], [b]) => a - b)) {
  writeStations(`subway/${year}`, [...st.values()].map((s) => ({id: name(s.name), name: s.name, lon: s.lon, lat: s.lat, dong: s.dong,
    daily: {board: s.board, alight: s.alight}})), ['board', 'alight'], undefined, {year});
}
