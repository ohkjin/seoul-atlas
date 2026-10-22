// Builds the daily weather + retail files the app reads, from the UHUS source tables:
//   ../UHUS/Daily_Weather.csv  — 422 dongs × 366 days: temp_max, apptemp_max, humid_max, precip_sum
//   ../UHUS/sales.csv          — 422 dongs × 366 days: retail_total_amount (and ~80 industries)
// Writes
//   public/data/dong_daily_core.json  { fields, dong: { [dong_code]: [[...fields], ...366 days] } }
//   public/data/gu_daily_core.json    { fields, gu:   { [gu_code]:  [{date, v: [...fields]}, ...] }, holidays: [date] }
// District values are built the way the old atlas did (checked against its files):
// weather is the mean over the district's dongs, retail the sum.
// Run from seoul-atlas-kepler/:  node scripts/build-daily.mjs
import fs from 'node:fs';

const SRC = '../UHUS';
// is_hot / is_mild: the source's own heat-day and mild-day flags (1/0 per dong; per district
// the share of its dongs) — RHSI is defined on exactly these days
const FIELDS = ['temp_max', 'apptemp_max', 'humid_max', 'precip_sum', 'retail_total_amount', 'is_hot', 'is_mild'];
const SUM = new Set(['retail_total_amount']);
const DIGITS = {temp_max: 1, apptemp_max: 1, humid_max: 1, precip_sum: 1, retail_total_amount: 0, is_hot: 0, is_mild: 0};

function readCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  return {col: (name) => head.indexOf(name), rows: lines.slice(1).map((l) => l.split(','))};
}
const round = (v, d) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

const weather = readCsv(`${SRC}/Daily_Weather.csv`);
const sales = readCsv(`${SRC}/sales.csv`);

// date|dong → values
const byKey = new Map();
const guOf = new Map();
const dates = new Set();
const w = Object.fromEntries(['date', 'gu_code', 'dong_code', 'temp_max', 'apptemp_max', 'humid_max', 'precip_sum', 'is_holiday', 'is_hot', 'is_mild'].map((n) => [n, weather.col(n)]));
const holidays = new Set();   // public holidays — mild days exclude them (the RHSI definition)
for (const r of weather.rows) {
  const k = `${r[w.date]}|${r[w.dong_code]}`;
  byKey.set(k, {temp_max: +r[w.temp_max], apptemp_max: +r[w.apptemp_max], humid_max: +r[w.humid_max], precip_sum: +r[w.precip_sum],
    is_hot: r[w.is_hot] === 'True' ? 1 : 0, is_mild: r[w.is_mild] === 'True' ? 1 : 0});
  guOf.set(r[w.dong_code], r[w.gu_code]);
  dates.add(r[w.date]);
  if (r[w.is_holiday] === 'True') holidays.add(r[w.date]);
}
const s = {date: sales.col('date'), dong_code: sales.col('dong_code'), retail: sales.col('retail_total_amount')};
for (const r of sales.rows) {
  const k = `${r[s.date]}|${r[s.dong_code]}`;
  const o = byKey.get(k) ?? {};
  o.retail_total_amount = +r[s.retail];
  byKey.set(k, o);
}

const days = [...dates].sort();
const dongs = [...guOf.keys()].sort();
const dong = {};
for (const d of dongs) dong[d] = days.map((day) => FIELDS.map((f) => round(byKey.get(`${day}|${d}`)?.[f], DIGITS[f])));

const gu = {};
for (const g of [...new Set(guOf.values())].sort()) {
  const members = dongs.filter((d) => guOf.get(d) === g);
  gu[g] = days.map((day, i) => ({
    date: day,
    v: FIELDS.map((f, j) => {
      const vals = members.map((d) => dong[d][i][j]).filter((x) => x != null);
      const total = vals.reduce((a, b) => a + b, 0);
      return vals.length ? round(SUM.has(f) ? total : total / vals.length, SUM.has(f) ? 0 : 2) : null;
    })
  }));
}

fs.writeFileSync('public/data/dong_daily_core.json', JSON.stringify({fields: FIELDS, dong}));
fs.writeFileSync('public/data/gu_daily_core.json', JSON.stringify({fields: FIELDS, gu, holidays: [...holidays].sort()}));
console.log(`dongs ${dongs.length}, districts ${Object.keys(gu).length}, days ${days.length}`);
