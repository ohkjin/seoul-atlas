// Builds daily subway boardings / alightings per dong from Seoul Open Data Plaza files (public, KOGL type 1):
//   ../raw-public/subway/CARD_SUBWAY_MONTH_2024MM.csv  OA-12914 서울시 지하철호선별 역별 승하차 인원 정보
//       사용일자, 노선명, 역명, 승차총승객수, 하차총승객수 — one row per station × line × day (transit-card taps)
//   ../raw-public/subway/station_master.csv            OA-21232 서울시 역사마스터 정보 (역사_ID, 역사명, 호선, 위도, 경도)
// Writes (public-data-lib.mjs shape)
//   public/data/opendata/subway_board.json, subway_alight.json   dong × 366 days
//   public/data/opendata/subway_stations.json   [{ name, lines, lon, lat, dong, board, alight }] 2024 totals per station
// A station counts in the dong its point falls in; stations outside Seoul are dropped.
// Run from seoul-atlas-kepler/:  node scripts/build-subway.mjs
import fs from 'node:fs';
import {RAW, DAYS, dayOf, readText, splitCsv, dongAt, writeDaily, writeJson, writeStations} from './public-data-lib.mjs';

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

const stations = new Map(); // name → { lines, lon, lat, dong, board[], alight[] }
const unplaced = new Map();
let outside = 0;
for (const f of fs.readdirSync(DIR).filter((f) => /^CARD_SUBWAY_MONTH_2024\d\d\.csv$/.test(f)).sort()) {
  const rows = readText(`${DIR}/${f}`).trim().split(/\r?\n/).slice(1).map(splitCsv);
  for (const [date, ln, nm, on, off] of rows) {
    const i = dayOf(date);
    if (i < 0) continue;
    const p = place(ln, nm);
    if (!p) {
      unplaced.set(`${ln} ${nm}`, (unplaced.get(`${ln} ${nm}`) ?? 0) + (+on || 0));
      continue;
    }
    const d = dongAt(p.lon, p.lat);
    if (!d) {
      outside++;
      continue;
    }
    const key = `${name(nm)}@${d}`;
    const s = stations.get(key) ?? stations.set(key, {name: nm, lines: new Set(), lon: p.lon, lat: p.lat, dong: d,
      board: new Array(DAYS).fill(0), alight: new Array(DAYS).fill(0)}).get(key);
    s.lines.add(ln);
    s.board[i] += +on || 0;
    s.alight[i] += +off || 0;
  }
}

const board = new Map();
const alight = new Map();
for (const s of stations.values()) {
  const b = board.get(s.dong) ?? board.set(s.dong, new Array(DAYS).fill(0)).get(s.dong);
  const a = alight.get(s.dong) ?? alight.set(s.dong, new Array(DAYS).fill(0)).get(s.dong);
  s.board.forEach((v, i) => (b[i] += v));
  s.alight.forEach((v, i) => (a[i] += v));
}

const total = (arr) => arr.reduce((s, v) => s + v, 0);
console.log(`${stations.size} stations in Seoul, ${board.size} dongs with a station; ${outside} rows outside Seoul`);
if (unplaced.size) {
  console.log(`${unplaced.size} station rows with no place (2024 boardings):`);
  for (const [k, v] of [...unplaced].sort((a, b) => b[1] - a[1])) console.log(`  ${k}  ${v}`);
}
writeDaily('subway_board', board);
writeDaily('subway_alight', alight);
writeJson('subway_stations', [...stations.values()].map((s) => ({name: s.name, lines: [...s.lines],
  lon: +s.lon.toFixed(6), lat: +s.lat.toFixed(6), dong: s.dong, board: total(s.board), alight: total(s.alight)})));
writeStations('subway', [...stations.values()].map((s, i) => ({id: i, name: s.name, lon: s.lon, lat: s.lat, dong: s.dong,
  daily: {board: s.board, alight: s.alight}})), ['board', 'alight']);
