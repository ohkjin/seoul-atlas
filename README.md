# Seoul Atlas (kepler.gl)

Map-first dashboard for the UHUS project, built on kepler.gl 3.2.6 (React + Redux, Vite).
The successor to `../seoul-data-atlas`; that repo stays as the design reference.

```bash
npm install
npm run dev       # http://localhost:5180
npm run build     # production bundle in dist/
npm run typecheck
```

## Data

`public/data/` holds what the app reads. The daily weather and retail totals are built
from the UHUS source tables in `../UHUS` (`Daily_Weather.csv`, `sales.csv`):

```bash
node scripts/build-daily.mjs   # → dong_daily_core.json, gu_daily_core.json
```

District values are the mean of their dongs for weather and the sum for sales. The per-dong
daily files (`dong_daily_core.json`, `dong_group_daily.json`) are large and load on demand,
the first time a daily variable is shown under Dong detail; the district rows stand in until
then.

## Atlas and Sandbox

kepler.gl is a library inside the app; everything on the map is a kepler dataset, layer
or filter. The **atlas** (Map, Dashboard) drives kepler: it decides which layers exist,
recolours some day by day and owns the `time` filter — so kepler's own tools are kept
small there (the ⚙ panel edits the atlas's layers; Add data / Add layer are hidden).

The **Sandbox** tab hands the map to plain kepler: the atlas's panels and automation step
aside, and kepler's full UI (Add data, Add layer, Filters, its time slider, its map
controls) works on the same data. See `src/overlay/sandbox.ts`:

- Leaving parks what was made there — the user's layers hidden, their filters removed
  (kepler 3.2.6 still applies a filter marked `enabled: false`) — and restores the atlas
  as it was; entering again brings them back. A removed `time` filter is re-created.
- "By district" / "By neighbourhood" add one filter on the place name across every
  dataset that has it (kepler's panel only syncs time filters).
- Every column has a `displayName` (`withDisplayNames` in `src/data/uhus.ts`), so kepler's
  pickers, filters and tooltips read "District", "Neighbourhood", "RHSI".

## Dependency pins — read before upgrading

- **`.npmrc` → `legacy-peer-deps=true`.** kepler 3.x ships loaders.gl 4 while deck.gl 8.9
  still declares a loaders.gl 3 peer. Upstream installs with yarn, which only warns about
  that; npm refuses to install at all.
- **`overrides` pin the loaders.gl 4.x family to 4.3.2.** kepler asks for `^4.3.2` and was
  tested on 4.3.x. Left floating, npm picks 4.5.x, whose new `@loaders.gl/geoarrow`
  CommonJS-requires `apache-arrow` subpaths and crashes the app at startup under Vite
  ("Dynamic require of apache-arrow/type is not supported"). The `@>=4` range keys leave
  deck.gl's own loaders.gl 3.4 copies untouched.
- `vite.config.ts` is kepler's official Vite example config (port changed to 5180).

## Things that are easy to break

- **Region codes must stay strings.** kepler's type analyzer reads `gu_code` as an integer
  and the 10-digit `dong_code` as a unix *timestamp*. `keepAsText()` in `src/data/uhus.ts`
  forces them back to text. Sales amounts (~3 billion won) were likewise typed as
  timestamps; `keepAsReal()` forces the daily value columns to numbers.
- **Time filters run on the GPU**, so `dataset.filteredIndex` ignores the playing time
  window. `src/overlay/focusValues.ts` re-applies range filters itself.
- **kepler has no camera transitions.** `src/overlay/flyTo.ts` animates the flight and
  fits regions into the part of the map not covered by panels.
- kepler class names like `sc-dba-DnL` are build hashes. `src/styles.css` reaches kepler's
  time widget through its stable child (`:has(> .bottom-widget--container)`).

## Deployment — Cloudflare Pages

A static site: `npm run build` writes everything to `dist/` (about 34 MB; the largest
file, the app bundle, is about 11 MB — under Pages' 25 MB per-file limit).

Cloudflare dashboard → Workers & Pages → Create → Pages → **Connect to Git** → this
repository, then:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None (or Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | (blank — the repository root) |

- If the project was created as a **Worker** instead (deploy command `npx wrangler deploy`),
  `wrangler.jsonc` makes it upload `dist/` as static assets. Without that file wrangler runs
  its auto-setup, which builds the app a second time and runs out of memory.
- The build script raises Node's heap to 4 GB; the default ~2 GB is barely enough.
- Node comes from `.nvmrc` (22). npm reads `.npmrc` (`legacy-peer-deps`, see above),
  so the install needs no extra flags.
- No environment variables are needed: the basemaps are CARTO's and need no Mapbox token.
- Every push to `main` redeploys; other branches get their own preview URL.
- `public/_headers` sets caching: content-hashed `/assets/` for a year, the rest revalidated.
- The data in `public/data/` is committed as built. To rebuild it from the UHUS CSVs,
  see [Data](#data) — the sources are not part of this repository.

## Dev-only console helpers

`__store` (the Redux store) and `__overlaps()` (lists every pair of overlapping panels).
Both are stripped from production builds.
