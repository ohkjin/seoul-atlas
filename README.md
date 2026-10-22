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
