// Builds daily living population per dong from Seoul Open Data Plaza files (public, KOGL type 1):
//   ../raw-public/livepop/250_LOCAL_RESD_ADMDONG_2024MM.zip  OA-23016 [내국인] 행정동별 서울 생활인구(250m)
//       one CSV per month: 일자, 시간 (00–23), 행정동코드 (8 digits), 생활인구합계, then sex × age bands
//       — the people present in the dong at that hour (Seoul × KT, 250 m cells summed to dongs; Korean nationals)
// Writes (public-data-lib.mjs shape; district = sum of its dongs)
//   public/data/opendata/livepop_mean.json    mean over the 24 hours
//   public/data/opendata/livepop_day.json     mean over 09–17 h (daytime)
//   public/data/opendata/livepop_night.json   mean over 00–05 h (night-time)
// The data has 426 dongs, the atlas 422; matched the way UHUS matched its card sales (UHUS/sales_README.md §5):
// 상일1동 + 상일2동 are summed into 상일동; 항동, 둔촌1동 and 반포본동 have no atlas dong and are left out
// (so their districts' sums miss them).
// Run from seoul-atlas-kepler/:  node scripts/build-livepop.mjs
import fs from 'node:fs';
import {RAW, DAYS, dayOf, splitCsv, zipEntries, guOfDong, writeDaily} from './public-data-lib.mjs';

const DIR = `${RAW}/livepop`;
const WINDOWS = {mean: [0, 23], day: [9, 17], night: [0, 5]};
const MERGED = {'11740525': '1174010300', '11740526': '1174010300'};
const LEFT_OUT = new Set(['11530800', '11740690', '11650550']);

// hourly sums per atlas dong × day (merged dongs add up hour by hour), NaN = hour missing
const hourly = new Map();
const unknown = new Set();
for (const f of fs.readdirSync(DIR).filter((f) => /^250_LOCAL_RESD_ADMDONG_2024\d\d\.zip$/.test(f)).sort()) {
  for (const e of zipEntries(`${DIR}/${f}`).filter((e) => e.name.endsWith('.csv'))) {
    const buf = e.data();
    let text;
    try {
      text = new TextDecoder('utf-8', {fatal: true}).decode(buf);
    } catch {
      text = new TextDecoder('euc-kr').decode(buf);
    }
    const lines = text.split(/\r?\n/);
    for (let k = 1; k < lines.length; k++) {
      if (!lines[k]) continue;
      const [date, hour, code8, total] = splitCsv(lines[k]);
      const i = dayOf(date);
      if (i < 0 || LEFT_OUT.has(code8)) continue;
      const dong = MERGED[code8] ?? `${code8}00`;
      if (!guOfDong.has(dong)) {
        unknown.add(code8);
        continue;
      }
      const h = hourly.get(dong) ?? hourly.set(dong, new Float64Array(DAYS * 24).fill(NaN)).get(dong);
      const k2 = i * 24 + +hour;
      h[k2] = (Number.isNaN(h[k2]) ? 0 : h[k2]) + (+total || 0);
    }
    console.log(`  read ${e.name}`);
  }
}

if (unknown.size) console.log(`dong codes not in the atlas geometry: ${[...unknown].join(', ')}`);
const missing = [...guOfDong.keys()].filter((d) => !hourly.has(d));
if (missing.length) console.log(`atlas dongs with no data: ${missing.join(', ')}`);
for (const [key, [h0, h1]] of Object.entries(WINDOWS)) {
  const out = new Map();
  let gaps = 0;
  for (const [dong, h] of hourly) {
    out.set(dong, Array.from({length: DAYS}, (_, i) => {
      const vs = [];
      for (let t = h0; t <= h1; t++) if (!Number.isNaN(h[i * 24 + t])) vs.push(h[i * 24 + t]);
      if (vs.length < h1 - h0 + 1) gaps++;
      return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
    }));
  }
  if (gaps) console.log(`  ${key}: ${gaps} dong-days missing some hours`);
  writeDaily(`livepop_${key}`, out);
}
