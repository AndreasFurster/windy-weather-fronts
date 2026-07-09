# Windy Weather Fronts — LLM guide

Weather fronts (cold/warm/occluded/stationary + H/L pressure centers) from
European weather services, collected by a backend and shown in a Windy.com
plugin and on a comparison website.

## The three parts

| Dir | What | Stack | Build |
| --- | --- | --- | --- |
| `server/` | Collects data hourly, serves JSON API | Node/TS, Express (local) + Vercel functions (prod) | none — `tsx` locally, `@vercel/node` bundles `api/` on deploy |
| `plugin/` | Windy.com map plugin | Svelte 4 + Windy plugin API | **rollup via `@windycom/plugin-devtools` — do NOT convert to Vite**; the official toolchain produces the Windy-specific module wrapper, `plugin.json` and the publish flow |
| `website/` | Chart comparison grid + extraction demo page | Vue 3 + TS + Vite, vue-router, leaflet | `npm run build` (vue-tsc + vite) |

Deployments: server → https://weather-fronts-server.vercel.app (Vercel,
root directory `server`), website → https://weather-fronts-website.vercel.app
(root `website`; its `vercel.json` proxies `/api` to the server). Push to
`main` deploys both.

## Data flow

Two independent pipelines, refreshed hourly:

1. **Vectorized front geometry** (`server/src/sources/`) → GeoJSON for the
   plugin. Sources: `knmi` (extracted from chart images, see below), `wpc`
   (NOAA coded text bulletins, exact), `metoffice` (IAC FLEET coded text,
   exact). Every feature has `properties.kind`: `front` (LineString,
   `frontType`) or `pressure-center` (Point, `centerType`).
2. **Mirrored chart images** (`server/src/charts/`) → for the website grid;
   nothing is hotlinked. Sources: knmi, meteobe (MP4 split into frames with
   ffmpeg; falls back to mirroring the video — ffmpeg is absent on Vercel),
   dwd, metoffice, aemet, wetterpate, meteofrance (needs `METEOFRANCE_TOKEN`).

### KNMI image extraction (`server/src/knmi/`)

KNMI publishes fronts only as GIF charts. Pipeline (`extract.ts`, `image.ts`):
exact palette color masks (cold `0,0,255`, warm `255,0,0`, occluded
`160,32,240`) → connected components → Zhang-Suen thinning → spur pruning
(removes triangle/semicircle symbols) → longest-path trace → Douglas-Peucker →
fragment re-joining (small gaps unconditionally, larger gaps only when line
direction continues — fronts get cut by overdrawn isobars/labels) → alternating
red/blue chains become stationary fronts → Chaikin smoothing. Isolated
letter-shaped components become H (blue) / L (red) pressure centers.
Pixel→lat/lon via a calibrated polar stereographic projection (`georef.ts`);
recalibrate with `npm run calibrate` if KNMI changes the chart layout (a size
check makes the source fail safe). Debug: `npm run extract-preview`.

## Storage (IDataStore, two backends)

All handler logic is in `server/src/apiHandlers.ts` against the `IDataStore`
interface (`dataStore.ts`):

- **DiskDataStore** — local/Docker Express server (`src/index.ts`), files
  under `server/data/`, in-process `setInterval` scheduler.
- **BlobDataStore** — Vercel functions (`server/api/**`), Vercel Blob keys:
  `fronts/<sourceId>.json`, `charts/<sourceId>/<file>` (images),
  `charts/meta/<sourceId>.json` (one meta blob per source — deliberately NOT
  one shared index, so parallel refreshes can't clobber each other).
  `StoredChart.url` is absolute (Blob CDN) on Vercel, relative `/charts/...`
  locally; the website handles both (`resolveMediaUrl`).

Data survives deploys; each refresh overwrites/prunes, nothing expires
automatically.

## API (same on both backends)

- `GET /api/sources` — vector sources + available times
- `GET /api/fronts/:sourceId` — full GeoJSON dataset
- `GET /api/charts` — mirrored chart metadata + URLs
- `GET /api/knmi/process` — all intermediate extraction steps for the
  website's `/plugin` demo page (chart, pixel paths, projection, GeoJSON)
- `POST /api/refresh/fronts/:id`, `POST /api/refresh/charts/:id` — refresh one
  source; guarded by `x-refresh-token` header when `REFRESH_TOKEN` env is set
- `GET|POST /api/refresh` — refresh everything (streams progress; local +
  `server/api/refresh.ts`)
- `GET /health`

Scheduling on Vercel: `.github/workflows/refresh-fronts.yml` (hourly GitHub
Actions cron) calls the per-source refresh endpoints — Vercel Hobby cron only
allows 1×/day. GitHub secret `REFRESH_TOKEN` must equal the Vercel env var.

## Commands

```sh
cd server && npm start            # Express on :3311 (tsx, no build)
cd server && npx tsc --noEmit     # typecheck (includes api/)
cd website && npm run dev         # Vite on :5173, proxies /api → :3311
cd website && npm run build       # vue-tsc + vite build
cd plugin && npm start            # rollup watch, https://localhost:9999
cd plugin && npm run build:win    # production build (Windows; `build` on unix)
```

Plugin dev: load `https://localhost:9999/plugin.js` at windy.com/developer-mode.

## Conventions & pitfalls

- **Relative imports use `.js` specifiers** (NodeNext style) even though files
  are `.ts` — the Vercel bundler requires this; consequently plain
  `node src/index.ts` does NOT work, use `tsx`. TS configs use `noEmit`.
- Server code must stay runnable in BOTH runtimes: no top-level disk access in
  anything imported by `server/api/**`; disk I/O only via DiskDataStore.
- `server/vercel.json` sets `"framework": null` — without it Vercel detects
  Express and wraps `src/index.ts` as a crashing catch-all. Keep function
  `maxDuration`s listed there in sync when adding endpoints.
- Chart sources scrape public pages with regexes — when one breaks, only that
  source goes unavailable (previous data is kept); check the runtime logs.
- Plugin backend URL is hardcoded in `plugin/src/api.ts` (`BACKEND_URL`).
- Website times are local by default with a UTC toggle (`website/src/time.ts`);
  keep any new time display consistent with that.
- The KNMI projection params in `georef.ts` are calibration output — don't
  hand-edit; rerun the calibrate tool instead.
