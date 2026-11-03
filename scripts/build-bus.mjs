// Builds daily bus boardings / alightings per dong from Seoul Open Data Plaza files (public, KOGL type 1):
//   ../raw-public/bus/BUS_STATION_BOARDING_MONTH_2024MM.csv  OA-12912 서울시 버스노선별 정류장별 승하차 인원 정보
//       사용일자, 노선번호, 노선명, 표준버스정류장ID, 버스정류장ARS번호, 역명, 승차총승객수, 하차총승객수, 등록일자
//       — one row per route × stop × day (transit-card taps; Seoul city, express and village buses)
//   ../raw-public/bus/stops_20241209.xlsx  OA-15067 서울시 버스정류소 위치정보 (NODE_ID, ARS_ID, 정류소명, X좌표, Y좌표)
// Writes (public-data-lib.mjs shape)
//   public/data/opendata/bus_board.json, bus_alight.json   dong × 366 days
//   public/data/opendata/bus_stops.json   [{ id, name, lon, lat, dong, board, alight }] 2024 totals per stop
// Routes are summed per stop. A stop is found by its standard ID (= NODE_ID), else by its ARS number;
// stops missing from the December 2024 list are reported and left out, as are stops outside Seoul.
// Run from seoul-atlas-kepler/:  node scripts/build-bus.mjs
import fs from 'node:fs';
import {RAW, DAYS, dayOf, splitCsv, eachLine, sniffEncoding, readXlsx, fixMojibake, dongAt, writeDaily, writeJson, writeStations}
  from './public-data-lib.mjs';

const DIR = `${RAW}/bus`;

const byNode = new Map();
const byArs = new Map();
for (const [node, ars, nm, x, y] of readXlsx(`${DIR}/stops_20241209.xlsx`).slice(1)) {
  if (!node || !+x) continue;
  const s = {id: node, name: fixMojibake(nm), lon: +x, lat: +y, dong: dongAt(+x, +y)};
  byNode.set(node, s);
  if (/^\d+$/.test(ars)) byArs.set(ars.padStart(5, '0'), s);
}

const perStop = new Map(); // node id → { board[], alight[] }
let unmatched = 0;
let outside = 0;
let all = 0;
for (const f of fs.readdirSync(DIR).filter((f) => /^BUS_STATION_BOARDING_MONTH_2024\d\d\.csv$/.test(f)).sort()) {
  await eachLine(`${DIR}/${f}`, sniffEncoding(`${DIR}/${f}`), (line, n) => {
    if (n === 0) return;
    const [date, , , node, ars, , on, off] = splitCsv(line);
    const i = dayOf(date);
    if (i < 0) return;
    const v = +on || 0;
    all += v;
    const s = byNode.get(node) ?? byArs.get(ars.padStart(5, '0'));
    if (!s) return void (unmatched += v);
    if (!s.dong) return void (outside += v);
    const t = perStop.get(s.id) ?? perStop.set(s.id, {board: new Array(DAYS).fill(0), alight: new Array(DAYS).fill(0)})
      .get(s.id);
    t.board[i] += v;
    t.alight[i] += +off || 0;
  });
  console.log(`  read ${f}`);
}

const board = new Map();
const alight = new Map();
for (const [id, t] of perStop) {
  const d = byNode.get(id).dong;
  const b = board.get(d) ?? board.set(d, new Array(DAYS).fill(0)).get(d);
  const a = alight.get(d) ?? alight.set(d, new Array(DAYS).fill(0)).get(d);
  t.board.forEach((v, i) => (b[i] += v));
  t.alight.forEach((v, i) => (a[i] += v));
}

const pct = (v) => `${((100 * v) / all).toFixed(2)}%`;
console.log(`${perStop.size} stops in ${board.size} dongs; boardings with no stop location ${pct(unmatched)}, ` +
  `outside Seoul ${pct(outside)}`);
writeDaily('bus_board', board);
writeDaily('bus_alight', alight);
const total = (arr) => arr.reduce((s, v) => s + v, 0);
writeJson('bus_stops', [...perStop].map(([id, t]) => {
  const s = byNode.get(id);
  return {id, name: s.name, lon: +s.lon.toFixed(6), lat: +s.lat.toFixed(6), dong: s.dong,
    board: total(t.board), alight: total(t.alight)};
}));
writeStations('bus', [...perStop].map(([id, t]) => {
  const s = byNode.get(id);
  return {id, name: s.name, lon: s.lon, lat: s.lat, dong: s.dong, daily: {board: t.board, alight: t.alight}};
}), ['board', 'alight']);
