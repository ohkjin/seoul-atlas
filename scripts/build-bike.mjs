// Builds daily public-bike (따릉이) rentals per dong from Seoul Open Data Plaza files (public, KOGL type 1):
//   ../raw-public/bike/bike_daily_24MM.csv  OA-15246 서울시 공공자전거 따릉이 이용정보(일별)
//       대여일자, 대여소번호, 대여소, 대여구분코드, 성별, 연령대, 이용건수, … — rentals per station × day × user group
//   ../raw-public/bike/bike_stations_2412.xlsx  OA-13252 공공자전거 대여소 정보 (24.12월 기준): 대여소번호, 위도, 경도
// Writes (public-data-lib.mjs shape)
//   public/data/opendata/bike_rentals.json    dong × 366 days, rentals started at the dong's stations
//   public/data/opendata/bike_stations.json   [{ id, name, lon, lat, dong, rentals }] 2024 totals per station
// Stations missing from the December 2024 list are reported and left out.
// Run from seoul-atlas-kepler/:  node scripts/build-bike.mjs
import fs from 'node:fs';
import {RAW, DAYS, dayOf, splitCsv, eachLine, sniffEncoding, readXlsx, fixMojibake, dongAt, writeDaily, writeJson, writeStations}
  from './public-data-lib.mjs';

const DIR = `${RAW}/bike`;

// the sheet opens with five header rows; data rows start with the station number
const where = new Map();
for (const [no, nm, , , lat, lon] of readXlsx(`${DIR}/bike_stations_2412.xlsx`)) {
  if (!/^\d+$/.test(no) || !+lat || !+lon) continue;
  where.set(+no, {name: fixMojibake(nm).trim(), lon: +lon, lat: +lat, dong: dongAt(+lon, +lat)});
}

const perStation = new Map(); // station number → rentals[366]
let all = 0;
let unplaced = 0;
let outside = 0;
const unknownIds = new Set();
for (const f of fs.readdirSync(DIR).filter((f) => /^bike_daily_24\d\d\.csv$/.test(f)).sort()) {
  await eachLine(`${DIR}/${f}`, sniffEncoding(`${DIR}/${f}`), (line, n) => {
    if (n === 0) return;
    const [date, no, , , , , count] = splitCsv(line);
    const i = dayOf(date);
    if (i < 0) return;
    const v = +count || 0;
    all += v;
    const s = where.get(+no);
    if (!s) {
      unknownIds.add(no);
      return void (unplaced += v);
    }
    if (!s.dong) return void (outside += v);
    (perStation.get(+no) ?? perStation.set(+no, new Array(DAYS).fill(0)).get(+no))[i] += v;
  });
  console.log(`  read ${f}`);
}

const rentals = new Map();
for (const [no, arr] of perStation) {
  const d = where.get(no).dong;
  const r = rentals.get(d) ?? rentals.set(d, new Array(DAYS).fill(0)).get(d);
  arr.forEach((v, i) => (r[i] += v));
}

const pct = (v) => `${((100 * v) / all).toFixed(2)}%`;
console.log(`${perStation.size} stations in ${rentals.size} dongs; rentals at ${unknownIds.size} stations with no ` +
  `location ${pct(unplaced)}, outside Seoul ${pct(outside)}`);
writeDaily('bike_rentals', rentals);
writeJson('bike_stations', [...perStation].map(([no, arr]) => {
  const s = where.get(no);
  return {id: no, name: s.name, lon: +s.lon.toFixed(6), lat: +s.lat.toFixed(6), dong: s.dong,
    rentals: arr.reduce((a, b) => a + b, 0)};
}));
writeStations('bike', [...perStation].map(([no, arr]) => {
  const s = where.get(no);
  return {id: no, name: s.name, lon: s.lon, lat: s.lat, dong: s.dong, daily: {rentals: arr}};
}), ['rentals']);
