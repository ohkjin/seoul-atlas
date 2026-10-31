// Builds one file per industry of card sales, from ../UHUS/sales.csv (422 dongs × 366 days ×
// 84 industries, KRW). The app loads an industry's file only when it is put on the map.
// Writes
//   public/data/industry/<industry>_amount.json  { dong: { [dong_code]: [366 KRW] }, gu: { [gu_code]: [366 KRW] } }
//   public/data/industry/index.json              [{ key, group }]  (the sector of each industry)
// District values are the sum of their dongs, as for retail sales (build-daily.mjs).
// The sectors are the earlier atlas's six (seoul-data-atlas/scripts/prepare_sales_groups.py),
// the same groups as catalog SALES_GROUP_KEYS.
// Run from seoul-atlas-kepler/:  node scripts/build-industries.mjs
import fs from 'node:fs';

const GROUP = {
  fnb: ['korean_cuisine', 'japanese_cuisine', 'western_cuisine', 'chinese_cuisine', 'bakery', 'cafe', 'fast_food',
    'other_food', 'other_food_service', 'liquor_store'],
  retail: ['department_store', 'supermarket_large_format', 'discount_store', 'shopping_mall', 'chain_grocery',
    'independent_grocery', 'convenience_store', 'general_merchandise_imported', 'fresh_produce_seafood', 'butcher_shop',
    'home_appliances', 'furniture', 'other_distribution', 'chain_store', 'brand_exclusive_store',
    'office_equipment_stationery', 'handmade_goods_store', 'gift_certificate_lottery'],
  fashion: ['apparel', 'fashion_accessories', 'watches_jewelry', 'cosmetics', 'hair_salon', 'beauty_service',
    'massage_spa', 'sauna_bathhouse', 'laundry_dry_cleaner', 'door_to_door_mlm_sales'],
  health: ['pharmacy', 'general_hospital', 'general_clinic', 'dental_clinic', 'korean_medicine_clinic',
    'public_health_center', 'other_medical', 'veterinary_clinic', 'academy_learning_materials', 'school_tuition',
    'study_room', 'kindergarten', 'books', 'bookstore', 'cultural_goods', 'movie_performance', 'instruments_records',
    'computer_software'],
  leisure: ['gym', 'sports_facility', 'sports_leisure_goods', 'indoor_outdoor_golf', 'leisure_town_amusement_park',
    'game_room_arcade', 'karaoke', 'entertainment_venue', 'motel_inn_other_lodging', 'hotel_condo', 'gas_station',
    'parking_lot', 'auto_service', 'auto_accessories', 'used_car_dealer', 'motorcycle', 'toys_kids_bicycles', 'lpg_gas'],
  housing: ['real_estate_agency', 'interior_building_materials_kitchenware', 'legal_office_service',
    'accounting_patent_service', 'research_translation_service', 'wedding_hall_service', 'funeral_home_cemetery',
    'pet_shop', 'flower_shop', 'used_goods_store'],
};
const groupOf = new Map(Object.entries(GROUP).flatMap(([g, list]) => list.map((i) => [`${i}_amount`, g])));

const lines = fs.readFileSync('../UHUS/sales.csv', 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
const head = lines[0].split(',');
const col = (n) => head.indexOf(n);
const keys = head.filter((h) => h.endsWith('_amount') && h !== 'retail_total_amount');
const missing = keys.filter((k) => !groupOf.has(k));
if (missing.length) throw new Error(`industries with no sector: ${missing.join(', ')}`);

const [iDate, iGu, iDong] = ['date', 'gu_code', 'dong_code'].map(col);
const days = [...new Set(lines.slice(1).map((l) => l.slice(0, 10)))].sort();
const dayIndex = new Map(days.map((d, i) => [d, i]));
const dong = Object.fromEntries(keys.map((k) => [k, {}]));
const gu = Object.fromEntries(keys.map((k) => [k, {}]));
const colOf = keys.map(col);
for (const line of lines.slice(1)) {
  const r = line.split(',');
  const i = dayIndex.get(r[iDate]);
  keys.forEach((k, j) => {
    const v = Math.round(+r[colOf[j]] || 0);
    (dong[k][r[iDong]] ??= new Array(days.length).fill(0))[i] = v;
    (gu[k][r[iGu]] ??= new Array(days.length).fill(0))[i] += v;
  });
}

fs.mkdirSync('public/data/industry', {recursive: true});
let bytes = 0;
for (const k of keys) {
  const text = JSON.stringify({dong: dong[k], gu: gu[k]});
  fs.writeFileSync(`public/data/industry/${k}.json`, text);
  bytes += text.length;
}
fs.writeFileSync('public/data/industry/index.json', JSON.stringify(keys.map((k) => ({key: k, group: groupOf.get(k)}))));
console.log(`${keys.length} industries, ${days.length} days, ${(bytes / 1e6).toFixed(1)} MB`);
