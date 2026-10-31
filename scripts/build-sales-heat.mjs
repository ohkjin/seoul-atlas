// Builds the heat-day and mild-day mean card sales of every place, for each of the 84
// industries and retail sales — what the dashboard's sales panel lists as "fell most" /
// "rose most" and reads Seoul's typical neighborhood from, without loading 84 files.
// Writes
//   public/data/sales_heat.json  { ind: [key], dong: { [code]: [hot…, mild…] }, gu: {…}, seoul: [hot…, mild…] }
// where hot / mild are the KRW means over the place's heat days and mild days, one per `ind`.
// Days are the source's own is_hot / is_mild flags (Daily_Weather.csv): a dong's own; a
// district's where most of its dongs have them, its sales the sum of its dongs; Seoul's where
// the districts' shares average half or more — as the dashboard reads them off the daily tables.
// Run from seoul-atlas-kepler/:  node scripts/build-sales-heat.mjs
import fs from 'node:fs';

function readCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  return {head, col: (name) => head.indexOf(name), rows: lines.slice(1).map((l) => l.split(','))};
}
const sales = readCsv('../UHUS/sales.csv');
const weather = readCsv('../UHUS/Daily_Weather.csv');

const ind = [...sales.head.filter((h) => h.endsWith('_amount') && h !== 'retail_total_amount'), 'retail_total_amount'];
const days = [...new Set(sales.rows.map((r) => r[sales.col('date')]))].sort();
const dayOf = new Map(days.map((d, i) => [d, i]));
const N = days.length, K = ind.length;

// per dong: its sales [day][industry] and its flags
const dongs = new Map();   // code → {gu, v: Float64Array(N*K), hot: Uint8Array(N), mild: Uint8Array(N)}
const at = (code, gu) => dongs.get(code) ?? dongs.set(code, {gu, v: new Float64Array(N * K), hot: new Uint8Array(N), mild: new Uint8Array(N)}).get(code);
const sc = {date: sales.col('date'), gu: sales.col('gu_code'), dong: sales.col('dong_code'), ind: ind.map(sales.col)};
for (const r of sales.rows) {
  const d = at(r[sc.dong], r[sc.gu]), i = dayOf.get(r[sc.date]);
  sc.ind.forEach((c, k) => { d.v[i * K + k] = +r[c] || 0; });
}
const wc = {date: weather.col('date'), gu: weather.col('gu_code'), dong: weather.col('dong_code'), hot: weather.col('is_hot'), mild: weather.col('is_mild')};
for (const r of weather.rows) {
  const d = at(r[wc.dong], r[wc.gu]), i = dayOf.get(r[wc.date]);
  if (i == null) continue;
  d.hot[i] = r[wc.hot] === 'True' ? 1 : 0;
  d.mild[i] = r[wc.mild] === 'True' ? 1 : 0;
}

// the two means of every industry over a place's flagged days
function means(v, hot, mild) {
  const out = new Array(2 * K).fill(0), nh = hot.reduce((a, b) => a + b, 0), nm = mild.reduce((a, b) => a + b, 0);
  for (let i = 0; i < N; i++) for (let k = 0; k < K; k++) {
    if (hot[i]) out[k] += v[i * K + k] / nh;
    if (mild[i]) out[K + k] += v[i * K + k] / nm;
  }
  return out.map(Math.round);
}

const dong = {}, gu = {}, guShare = new Map();
for (const [code, d] of dongs) dong[code] = means(d.v, d.hot, d.mild);
for (const g of [...new Set([...dongs.values()].map((d) => d.gu))].sort()) {
  const members = [...dongs.values()].filter((d) => d.gu === g);
  const v = new Float64Array(N * K), sh = new Float64Array(N), sm = new Float64Array(N);
  for (const d of members) {
    for (let j = 0; j < N * K; j++) v[j] += d.v[j];
    for (let i = 0; i < N; i++) { sh[i] += d.hot[i] / members.length; sm[i] += d.mild[i] / members.length; }
  }
  guShare.set(g, {v, sh, sm});
  gu[g] = means(v, sh.map((x) => +(x >= 0.5)), sm.map((x) => +(x >= 0.5)));
}
const all = new Float64Array(N * K), ah = new Float64Array(N), am = new Float64Array(N);
for (const {v, sh, sm} of guShare.values()) {
  for (let j = 0; j < N * K; j++) all[j] += v[j];
  for (let i = 0; i < N; i++) { ah[i] += sh[i] / guShare.size; am[i] += sm[i] / guShare.size; }
}
const seoul = means(all, ah.map((x) => +(x >= 0.5)), am.map((x) => +(x >= 0.5)));

const text = JSON.stringify({ind, dong, gu, seoul});
fs.writeFileSync('public/data/sales_heat.json', text);
console.log(`dongs ${Object.keys(dong).length}, districts ${Object.keys(gu).length}, industries ${K}, ${(text.length / 1e6).toFixed(2)} MB`);
