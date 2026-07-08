# Weather Fronts — backend

Node.js backend that periodically collects weather front data and serves it
over a JSON API. It feeds both the [Windy plugin](../plugin/) (vectorized
GeoJSON) and the [comparison website](../website/) (mirrored chart images —
nothing is hotlinked).

## Running

Requires **Node.js ≥ 23.6** (runs TypeScript natively, no build step).
**ffmpeg** is optional: it is used to split the meteo.be MP4 animation into
frames; without it the video is mirrored as-is.

```sh
npm install
npm start          # http://localhost:3311
```

Or with Docker (ffmpeg included):

```sh
docker build -t weather-fronts-server .
docker run -p 3311:3311 -v fronts-data:/data weather-fronts-server
```

Environment variables: `PORT` (default 3311), `DATA_DIR` (default `./data`),
`METEOFRANCE_TOKEN` (optional, enables the Météo-France chart source).

All sources refresh at startup and then hourly; the last good dataset is kept
on refresh failures and persisted to `DATA_DIR` across restarts.

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/sources` | Vector-source metadata + available valid times |
| `GET /api/fronts/:sourceId` | Full GeoJSON dataset (`knmi`, `wpc`, `metoffice`) |
| `GET /api/charts` | Mirrored chart images per source (metadata + local URLs) |
| `GET /charts/<source>/<file>` | The mirrored images/videos themselves |
| `GET /health` | Liveness check |

## Vectorized front geometry (`src/sources/`)

- **KNMI** (`knmi.ts`) — KNMI publishes charts only as images, so fronts are
  vectorized from the GIFs (`src/knmi/`): exact palette color masks →
  Zhang-Suen thinning → spur pruning → centerline tracing → simplification.
  Fragments cut by overdrawn isobars/labels are re-joined; alternating
  red/blue chains become stationary fronts; isolated letter-shaped blue/red
  components become H/L pressure centers. Pixels map to lat/lon through the
  chart's polar stereographic projection, least-squares fitted against the
  10° graticule (`npm run calibrate`, median residual ≈ 0.25 px, verified
  against coastline landmarks). Rerun the calibration and paste the new
  parameters into `src/knmi/georef.ts` if KNMI changes the chart layout
  (a size check makes the source fail safe if that happens).
- **NOAA WPC** (`wpc.ts`) — coded surface bulletins CODSUS (analysis,
  positions in tenths of degrees) and CODSRP (12–48 h forecasts), exact.
- **Met Office** (`metoffice.ts`) — IAC FLEET (FM 46) analysis ASXX21 EGRR
  via NOAA, exact; includes fronts, pressure centers and troughs.

## Mirrored chart images (`src/charts/`)

Scraped from the public pages and downloaded to `DATA_DIR/charts/<source>/`:
KNMI, KMI/RMI (meteo.be; ffmpeg splits their MP4 into ~16 frames, the valid
time is drawn in the top-left of each frame), DWD, Met Office, AEMET,
wetterpate.de (FU Berlin) and Météo-France (token required). Files no longer
referenced are pruned each refresh.

## Debug tooling

- `npm run calibrate [chart.gif]` — refit the KNMI georeferencing.
- `npm run extract-preview <chart.gif> <out.json>` — dump traced front pixel
  paths + pressure centers for overlaying on the source image.
