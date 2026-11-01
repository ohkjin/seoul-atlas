"""Mockups: picking which of two daily variables the time card draws. Built on the real card:
retail sales as the main, max temperature linked, 4 Aug 2024, all of Seoul; each option is
put into the card's own DOM and the right column captured.

    python mockups/time-vars/shoot.py [app url]     # the dev server must be running

now — the card as it is: the first daily variable only
A   — the two names as a toggle above the chart, in the Actual | Scaled style
B   — ‹ › arrows around the name at the foot
C   — both years, one small chart each, stacked
Out: <option>.png and sheet.png.
"""
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
APP = next((a for a in sys.argv[1:] if a.startswith("http")), "http://localhost:5181/")
W, H, DSF = 1440, 810, 2
# python shoot.py [url] [colours]: the C card's colour options instead of A/B/C
COLOURS = "colours" in sys.argv
OPTS = ["now", "C1", "C2", "C3"] if COLOURS else ["now", "A", "B", "C1"]
LABELS = ({"now": "now", "C1": "C1 — sales teal, temperature blue→red", "C2": "C2 — both neutral",
           "C3": "C3 — sales neutral, temperature blue→red"} if COLOURS else
          {"now": "now — first daily variable only", "A": "A — name toggle above the chart",
           "B": "B — ‹ › arrows at the foot", "C1": "C — two small charts, stacked"})
DAY_MS = "Date.parse('2024-08-04T00:00:00Z')"

SET_DAY = """(day) => {
  const st = window.__store, t = st.getState().keplerGl.map.visState.filters.findIndex((f) => f.id === 'time');
  st.dispatch({type: '@@kepler.gl/SET_FILTER', idx: t, prop: 'value', value: [day, day + 86400000 - 1], valueIndex: 0});
}"""

# each option edits the card; undo() puts it back
OPTION = """(opt) => {
  const card = document.querySelector('.time-card');
  document.querySelectorAll('.mock').forEach((e) => e.remove());
  card.querySelectorAll('[data-hid]').forEach((e) => { e.style.display = ''; e.removeAttribute('data-hid'); });
  const hide = (e) => { e.style.display = 'none'; e.setAttribute('data-hid', '1'); };
  const chart = card.querySelector('.tc-chart'), foot = card.querySelector('.tc-foot'), name = foot.querySelector('.tc-var');
  if (opt === 'A') {
    const seg = document.createElement('div');
    seg.className = 'mock tc-seg';
    seg.style.cssText = 'display:flex;margin:10px 0 0;width:100%;box-sizing:border-box';
    seg.innerHTML = '<button class="on" style="flex:1">Retail sales</button><button style="flex:1">Max temperature</button>';
    chart.before(seg);
  }
  if (opt === 'B') {
    const arrow = (t) => `<button class="mock icon-btn" style="width:22px;height:22px;font-size:14px;padding:0;flex:none">${t}</button>`;
    name.insertAdjacentHTML('beforebegin', arrow('‹'));
    name.insertAdjacentHTML('afterend', arrow('›'));
    name.insertAdjacentHTML('beforeend', '<span class="mock" style="color:var(--ink-3);font-size:10.5px"> · 1 / 2</span>');
  }
  if (opt.startsWith('C')) {
    // colours: C1 each variable its own (sales teal, temperature blue→red by value),
    // C2 both neutral, C3 sales neutral and temperature blue→red
    const NEUTRAL = ['rgba(236,240,246,0.78)', 'rgba(236,240,246,0.08)'], TEAL = ['#3AA9A1', 'rgba(58,169,161,0.16)'];
    const salesC = opt === 'C1' ? TEAL : NEUTRAL, tempWarm = opt !== 'C2';
    // the second year: Seoul's max temperature, the mean of its neighbourhoods each day
    const ds = window.__store.getState().keplerGl.map.visState.datasets.dong_daily;
    const fi = (n) => ds.fields.findIndex((f) => f.name === n);
    const [di, ti] = [fi('date'), fi('temp_max')], dc = ds.dataContainer;
    const by = new Map();
    for (let r = 0; r < dc.numRows(); r++) {
      const d = Date.parse(String(dc.valueAt(r, di)).replace(' ', 'T') + 'Z'), v = dc.valueAt(r, ti);
      if (!Number.isFinite(v)) continue;
      const k = Math.ceil(d / 86400000), a = by.get(k) || [0, 0]; a[0] += v; a[1]++; by.set(k, a);
    }
    const days = [...by.keys()].sort((a, b) => a - b), vals = days.map((k) => by.get(k)[0] / by.get(k)[1]);
    const lo = Math.min(...vals), hi = Math.max(...vals), Wc = 288, Hc = 40;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1) * Wc).toFixed(1)},${(Hc - 3 - (v - lo) / (hi - lo) * (Hc - 6)).toFixed(1)}`).join('L');
    const at = days.indexOf(Math.floor(Date.parse('2024-08-04T00:00:00Z') / 86400000)), x = at / (days.length - 1) * Wc;
    const label = (t, v) => `<div class="mock" style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink-2);margin:8px 0 2px"><span>${t}</span><span style="color:var(--ink)">${v}</span></div>`;
    chart.insertAdjacentHTML('beforebegin', label('Retail sales (daily)', foot.querySelector('.tc-now').childNodes[0].textContent));
    chart.style.height = '44px';
    chart.querySelectorAll('path').forEach((p) => { if (p.classList.contains('tc-line')) p.style.stroke = salesC[0]; else p.style.fill = salesC[1]; });
    chart.setAttribute('data-hid', '1');
    chart.insertAdjacentHTML('afterend', label('Max temperature (daily)', vals[at].toFixed(1) + ' °C') +
      `<svg class="mock tc-chart" viewBox="0 0 ${Wc} ${Hc}" preserveAspectRatio="none" style="height:44px">` +
      `<defs><linearGradient id="tg-${opt}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#3079B4"/><stop offset="0.35" stop-color="#85BCD9"/>` +
      `<stop offset="0.6" stop-color="#FAE1D3"/><stop offset="0.8" stop-color="#EE9A7C"/><stop offset="1" stop-color="#C0383B"/></linearGradient></defs>` +
      `<path d="M${pts}L${Wc},${Hc}L0,${Hc}Z" fill="${tempWarm ? `url(#tg-${opt})` : NEUTRAL[1]}" fill-opacity="${tempWarm ? 0.18 : 1}"/>` +
      `<path d="M${pts}" fill="none" stroke="${tempWarm ? `url(#tg-${opt})` : NEUTRAL[0]}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` +
      `<line x1="${x}" x2="${x}" y1="0" y2="${Hc}" class="tc-head-line" vector-effect="non-scaling-stroke"/></svg>`);
    hide(name);
    hide(foot.querySelector('.tc-now'));
  }
  // the right column: the graph card above, the time card
  const a = document.querySelector('.graph-card').getBoundingClientRect(), b = card.getBoundingClientRect();
  return {x: Math.min(a.left, b.left) - 12, y: a.top - 12, w: Math.max(a.right, b.right) - Math.min(a.left, b.left) + 24, h: b.bottom - a.top + 24};
}"""

UNDO_C = "() => { const c = document.querySelector('.time-card .tc-chart'); if (c) { c.style.height = ''; c.querySelectorAll('path').forEach((p) => { p.style.stroke = ''; p.style.fill = ''; }); } }"


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False, args=[
            f"--force-device-scale-factor={DSF}", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist",
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
        row = lambda n: page.locator(".drow", has=page.locator(".dname", has_text=n)).first
        await page.locator(".dcard").nth(3).click()
        await asyncio.sleep(0.6)
        await row("Retail sales (daily)").locator("button.dicon.map").click()
        await asyncio.sleep(2)
        names = [t.strip() for t in await page.locator(".focus .layer-card .lc-name").all_inner_texts()]
        if "Max temperature (daily)" not in names:
            await row("Max temperature (daily)").locator("button.dicon.link").click()
        await page.wait_for_function("document.querySelectorAll('.focus .layer-card').length === 2", timeout=60000)
        await page.locator(".drawer-close").click()
        await page.evaluate(SET_DAY, await page.evaluate(DAY_MS))
        await asyncio.sleep(3)
        print("cards:", await page.locator(".focus .layer-card .lc-name").all_inner_texts())
        await page.mouse.move(10, H - 10)
        for opt in OPTS:
            box = await page.evaluate(OPTION, opt)
            await asyncio.sleep(0.4)
            await page.screenshot(path=str(HERE / f"{opt}.png"), clip={"x": box["x"], "y": box["y"], "width": box["w"], "height": box["h"]})
            await page.evaluate(UNDO_C)
            print(opt)
        await browser.close()
    sheet()


def sheet():
    labels = LABELS
    tiles = [Image.open(HERE / f"{o}.png") for o in labels]
    tw = max(t.width for t in tiles); th = max(t.height for t in tiles)
    pad = 56
    out = Image.new("RGB", (tw * 4 + 30 * 5, th + pad + 30), (11, 13, 17))
    d = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype("arial.ttf", 26)
    except OSError:
        font = None
    for i, (o, t) in enumerate(zip(labels, tiles)):
        x = 30 + i * (tw + 30)
        d.text((x, 16), labels[o], fill=(232, 163, 92), font=font)
        out.paste(t, (x, pad))
    out.save(HERE / ("sheet.png" if OPTS[1] == "A" else "colours.png"))


asyncio.run(main())
