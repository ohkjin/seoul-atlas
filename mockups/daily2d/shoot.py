"""Mockups of a daily variable alone on the flat map: as it is now, and three ways it could be.

    python mockups/daily2d/shoot.py     # the dev server must be running (APP below)

now — points with a white rim, a faint halo three times their size, additive blending
A   — the same points, no rim, no halo, normal blending
B   — no points: each neighbourhood's area coloured by the day's value
C   — B, with the district borders drawn over it

Colours are the variable's own ramp, cut at the same year-wide quantiles kepler uses for the
points, so only the drawing changes. Out: <var>_<look>.jpg and sheet.jpg (map region crops).
"""
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright
from PIL import Image

HERE = Path(__file__).parent
APP = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5181/"
W, H, DSF = 1440, 810, 4 / 3
DAY = 86400000
VARS = [("temp_max", "Max temperature (daily)", "2024-06-01"), ("retail_total_amount", "Retail sales (daily)", "2024-08-04")]
LOOKS = ["now", "A", "B", "C"]
CROP = (300, 70, 1160, 700)          # the map, in CSS px

SETUP = """async (day) => {
  const st = window.__store, vs = () => st.getState().keplerGl.map.visState;
  const t = vs().filters.findIndex((f) => f.id === 'time');
  st.dispatch({type: '@@kepler.gl/SET_FILTER', idx: t, prop: 'value', value: [day, day + 86400000 - 1], valueIndex: 0});
}"""

# kepler's action creators and the app's helpers, from the dev server's own modules
LOOK = """async ([look, key]) => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('kepler__gl_actions'));
  const M = await import(url), K = M.default ?? M;
  const {valuesByPlace} = await import('/src/overlay/focusValues.ts');
  const st = window.__store, vs = () => st.getState().keplerGl.map.visState, d = (a) => st.dispatch(a);
  const point = vs().layers.find((l) => l.id === 'v:' + key);
  if (look === 'now') return 'ok';
  for (const l of vs().layers.filter((l) => l.id.startsWith('halo:'))) d(K.removeLayer(l.id));
  d(K.updateLayerBlending('normal'));
  if (look === 'A') { d(K.layerVisConfigChange(point, {outline: false})); return 'ok'; }
  // B, C: the areas, coloured by the day's value at the points' year-wide quantile cuts
  const colors = point.config.visConfig.colorRange.colors;
  const daily = vs().datasets[point.config.dataId];
  const fi = daily.fields.findIndex((f) => f.name === key);
  const all = [];
  for (let r = 0; r < daily.dataContainer.numRows(); r++) { const v = daily.dataContainer.valueAt(r, fi); if (Number.isFinite(v)) all.push(v); }
  all.sort((a, b) => a - b);
  const cuts = colors.slice(1).map((_, i) => all[Math.floor(((i + 1) / colors.length) * all.length)]);
  const today = valuesByPlace(daily, key, 'dong_code', vs().filters);
  const area = vs().datasets.dong, ci = area.fields.findIndex((f) => f.name === 'dong_code');
  const bins = new Set();
  const colorMap = [];
  for (let r = 0; r < area.dataContainer.numRows(); r++) {
    const code = String(area.dataContainer.valueAt(r, ci)), v = today.get(code);
    let k = 0; while (v != null && k < cuts.length && v >= cuts[k]) k++;
    bins.add(k);
    colorMap.push([code, v == null ? '#2a2d34' : colors[k]]);
  }
  d(K.layerConfigChange(point, {isVisible: false}));
  const field = {name: 'dong_code', type: 'string'};
  d(K.addLayer({id: 'mock:area', type: 'geojson', config: {dataId: 'dong', label: 'mock', columns: {geojson: '_geojson'}, isVisible: true,
    colorField: field, colorScale: 'customOrdinal',
    visConfig: {opacity: 0.85, filled: true, stroked: true, strokeColor: [14, 16, 20], strokeOpacity: 0.8, thickness: 0.6,
      colorRange: {name: 'mock', type: 'custom', category: 'Custom', colors: colorMap.map((c) => c[1]), colorMap}}},
    visualChannels: {colorField: field, colorScale: 'customOrdinal'}}, 'dong'));
  if (look === 'C') d(K.addLayer({id: 'mock:gu', type: 'geojson', config: {dataId: 'gu', label: 'mock gu', columns: {geojson: '_geojson'},
    isVisible: true, visConfig: {filled: false, stroked: true, strokeColor: [236, 230, 218], strokeOpacity: 0.75, thickness: 1.6}}}, 'gu'));
  return 'bins ' + [...bins].sort().join(',');
}"""


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False, args=[
            f"--force-device-scale-factor={DSF:.7f}", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist",
            "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
            "--disable-background-timer-throttling", "--disable-features=CalculateNativeWinOcclusion",
            f"--window-size={W + 40},{H + 160}"])
        ctx = await browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=DSF)
        for key, name, day in VARS:
            for look in LOOKS:
                page = await ctx.new_page()
                page.on("pageerror", lambda e: print(f"  [pageerror] {e}"))
                await page.goto(APP)
                await page.locator(".drawer .dcard").first.wait_for(state="visible", timeout=120000)
                await page.wait_for_function("window.__store?.getState().keplerGl.map.visState.layers.length > 0", timeout=120000)
                await asyncio.sleep(3)
                await page.locator(".dcard").first.click()
                await asyncio.sleep(0.6)
                row = page.locator(".drow", has=page.locator(".dname", has_text=name)).first
                await row.locator("button.dicon.map").click()
                await asyncio.sleep(2.5)
                # alone on the map: the link the page opens with (or remembers) is undone
                cards = page.locator(".focus .layer-card .lc-name")
                if await cards.count() > 1:
                    other = (await cards.nth(1).inner_text()).strip()
                    linked = page.locator(".drow", has=page.locator(".dname", has_text=other)).first
                    await linked.locator("button.dicon.link").click()
                await page.wait_for_function(f"window.__store.getState().keplerGl.map.visState.layers"
                                             f".some((l) => l.id === 'v:{key}' && l.config.isVisible)", timeout=60000)
                await asyncio.sleep(2)
                await page.locator(".drawer-close").click()
                ms = await page.evaluate(f"Date.parse('{day}T00:00:00Z')")
                await page.evaluate(SETUP, ms)
                await asyncio.sleep(2.5)
                print(key, look, await page.evaluate(LOOK, [look, key]))
                await asyncio.sleep(2.5)
                await page.mouse.move(W - 5, H - 5)
                await page.screenshot(path=str(HERE / f"{key}_{look}.jpg"), type="jpeg", quality=90)
                await page.close()
        await browser.close()
    sheet()


def sheet():
    s = DSF
    box = tuple(int(v * s) for v in CROP)
    tiles = [[Image.open(HERE / f"{k}_{look}.jpg").crop(box) for look in LOOKS] for k, _, _ in VARS]
    tw, th = tiles[0][0].size
    tw2, th2 = tw // 2, th // 2
    out = Image.new("RGB", (tw2 * len(LOOKS), th2 * len(VARS)), "black")
    for r, rowt in enumerate(tiles):
        for c, t in enumerate(rowt):
            out.paste(t.resize((tw2, th2), Image.LANCZOS), (c * tw2, r * th2))
    out.save(HERE / "sheet.jpg", quality=90)


asyncio.run(main())
