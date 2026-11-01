"""Colour options for a signed variable (RHSI) on the flat map, painted over the app's own layer.

    python mockups/signed/shoot.py [app url]     # the dev server must be running

Out: <option>.jpg and sheet.jpg.
"""
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright
from PIL import Image, ImageDraw

HERE = Path(__file__).parent
APP = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5181/"
W, H, DSF = 1440, 810, 4 / 3
OPTIONS = {
    "now": ["#B2182B", "#E0785F", "#9C7F7A", "#7FA39F", "#35978F", "#0B7A70"],
    "A_shap": ["#008BFB", "#4A64F1", "#8A41DE", "#B426B5", "#DA1185", "#FF0051"],
    "B_rdbu": ["#3079B4", "#85BCD9", "#DAE9F1", "#FAE1D3", "#EE9A7C", "#C0383B"],
    "C_shap_flipped": ["#FF0051", "#DA1185", "#B426B5", "#8A41DE", "#4A64F1", "#008BFB"],
}
CROP = (0, 60, 1160, 700)

PAINT = """async (colors) => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('kepler__gl_actions'));
  const M = await import(url), K = M.default ?? M;
  const st = window.__store, layer = st.getState().keplerGl.map.visState.layers.find((l) => l.id === 'v:RHSI_retail');
  st.dispatch(K.layerVisConfigChange(layer, {colorRange: {name: 'mock', type: 'custom', category: 'Custom', colors}}));
}"""


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False, args=[
            f"--force-device-scale-factor={DSF:.7f}", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist",
            "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
            "--disable-background-timer-throttling", "--disable-features=CalculateNativeWinOcclusion",
            f"--window-size={W + 40},{H + 160}"])
        ctx = await browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=DSF)
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print(f"  [pageerror] {e}"))
        await page.goto(APP)
        await page.locator(".drawer .dcard").first.wait_for(state="visible", timeout=120000)
        await page.wait_for_function("window.__store?.getState().keplerGl.map.visState.layers.length > 0", timeout=120000)
        await asyncio.sleep(3)
        # RHSI alone: the page opens with it as the main, temperature linked
        await page.locator(".dcard").nth(0).click()
        await asyncio.sleep(0.6)
        await page.locator(".drow", has=page.locator(".dname", has_text="Max temperature (daily)")).first.locator("button.dicon.link").click()
        await page.wait_for_function("window.__store.getState().keplerGl.map.visState.layers"
                                     ".some((l) => l.id === 'v:RHSI_retail' && l.config.isVisible)", timeout=60000)
        await page.locator(".drawer-close").click()
        await asyncio.sleep(2.5)
        await page.mouse.move(W - 5, H - 5)
        for name, colors in OPTIONS.items():
            await page.evaluate(PAINT, colors)
            await asyncio.sleep(1.5)
            await page.screenshot(path=str(HERE / f"{name}.jpg"), type="jpeg", quality=88)
            print(name)
        await browser.close()
    box = tuple(int(v * DSF) for v in CROP)
    tiles = []
    for name in OPTIONS:
        t = Image.open(HERE / f"{name}.jpg").crop(box)
        t = t.resize((t.width // 2, t.height // 2), Image.LANCZOS)
        ImageDraw.Draw(t).text((10, t.height - 20), name, fill=(255, 255, 255))
        tiles.append(t)
    tw, th = tiles[0].size
    out = Image.new("RGB", (tw * 2, th * 2), "black")
    for i, t in enumerate(tiles):
        out.paste(t, ((i % 2) * tw, (i // 2) * th))
    out.save(HERE / "sheet.jpg", quality=90)


asyncio.run(main())
