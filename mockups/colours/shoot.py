"""The colour plan in the app: one variable at a time on the flat map, and a contact sheet.

    python mockups/colours/shoot.py [app url]     # the dev server must be running

Out: <key>.jpg and sheet.jpg (map and left column, each labelled).
"""
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright
from PIL import Image, ImageDraw

HERE = Path(__file__).parent
APP = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5181/"
W, H, DSF = 1440, 810, 4 / 3
# (key, drawer row name, theme column)
VARS = [("n_hot_days", "Heat days", 0), ("n_mild_days", "Mild days", 0), ("elderly_share", "Elderly", 1),
        ("residential_area_share", "Residential", 2), ("commercial_area_share", "Commercial", 2),
        ("green_space_share", "Green space", 2), ("retail_share", "Retail share", 3),
        ("subway_access_coverage", "Subway access", 4), ("RHSI_retail", "RHSI", 5)]
CROP = (0, 60, 1160, 700)


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
        for key, name, col in VARS:
            await page.locator(".dcard").nth(col).click()
            await asyncio.sleep(0.6)
            row = page.locator(".drow", has=page.locator(".dname", has_text=name)).first
            await row.scroll_into_view_if_needed()
            await row.locator("button.dicon.map").click()
            await asyncio.sleep(1.5)
            # alone on the map: whatever is linked is unlinked
            cards = page.locator(".focus .layer-card .lc-name")
            if await cards.count() > 1:
                other = (await cards.nth(1).inner_text()).strip()
                await page.locator(".drow", has=page.locator(".dname", has_text=other)).first.locator("button.dicon.link").click()
            await page.wait_for_function(f"window.__store.getState().keplerGl.map.visState.layers"
                                         f".some((l) => l.id === 'v:{key}' && l.config.isVisible)", timeout=60000)
            await page.locator(".drawer-close").click()
            await asyncio.sleep(2.5)
            await page.mouse.move(W - 5, H - 5)
            await page.screenshot(path=str(HERE / f"{key}.jpg"), type="jpeg", quality=88)
            print(key)
        await browser.close()
    sheet()


def sheet():
    box = tuple(int(v * DSF) for v in CROP)
    tiles = []
    for key, name, _ in VARS:
        t = Image.open(HERE / f"{key}.jpg").crop(box)
        t = t.resize((t.width // 3, t.height // 3), Image.LANCZOS)
        ImageDraw.Draw(t).text((8, t.height - 18), name, fill=(255, 255, 255))
        tiles.append(t)
    tw, th = tiles[0].size
    out = Image.new("RGB", (tw * 3, th * 3), "black")
    for i, t in enumerate(tiles):
        out.paste(t, ((i % 3) * tw, (i // 3) * th))
    out.save(HERE / "sheet.jpg", quality=90)


asyncio.run(main())
