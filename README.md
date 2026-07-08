# Windy Weather Fronts Plugin

A [Windy plugin](https://docs.windy-plugins.com/) that displays weather fronts
(cold, warm, occluded, stationary, troughs) and pressure centers from multiple
sources, plus a small backend that periodically collects and vectorizes the
data.

## How it works

```
KNMI chart images ──┐  (color masking, thinning,
                    │   tracing, georeferencing)
NOAA WPC bulletins ─┼─► server/ (Node.js) ─► GeoJSON API ─► Windy plugin (src/)
                    │  refreshes every hour,
Met Office IAC ─────┘  persists to server/data/
```

### Sources

| Source | Region | Times | Method |
| --- | --- | --- | --- |
| KNMI ([weerkaarten](https://www.knmi.nl/nederland-nu/weer/waarschuwingen-en-verwachtingen/weerkaarten)) | Europe / NE Atlantic | analysis + forecasts (~+12/+24/+36 h) | image extraction |
| NOAA WPC (coded surface bulletins [CODSUS](https://tgftp.nws.noaa.gov/data/raw/as/asus02.kwbc.cod.sus.txt) / CODSRP) | North America | analysis + 12–48 h forecasts | coded text, exact |
| Met Office (IAC FLEET, ASXX21 EGRR via NOAA) | Europe / North Atlantic | analysis | coded text, exact |

KNMI does not publish front geometry as raw data, so the backend vectorizes it
from the published GIF charts:

1. The chart palette is exact, so cold (blue), warm (red) and occluded
   (purple) fronts are isolated with per-color masks.
2. Connected components are thinned (Zhang-Suen), symbol bumps are pruned and
   the centerline is traced and simplified (`server/src/knmi/image.ts`).
3. Fragments cut apart by overdrawn isobars/labels are re-joined; H/L letters
   are filtered by size; alternating red/blue segment chains are merged into
   stationary fronts (`server/src/knmi/extract.ts`).
4. Pixel coordinates are mapped to lat/lon through the chart's polar
   stereographic projection (`server/src/knmi/georef.ts`). The projection
   parameters were least-squares fitted against the chart's 10° graticule
   with `npm run calibrate` (median residual ≈ 0.25 px) and verified against
   coastline landmarks. If KNMI ever changes the chart layout, rerun
   `npm run calibrate` in `server/` and paste the new parameters into
   `georef.ts`.

Extracted KNMI geometry is approximate (a few kilometers at chart scale); the
WPC and Met Office sources are exact as published.

## Running it

### 1. Backend

Requires Node.js ≥ 23.6 (runs TypeScript natively).

```sh
cd server
npm install
npm start          # listens on http://localhost:3311
```

All sources are refreshed at startup and then every hour
(`refreshMinutes` per source in `server/src/sources/*.ts`). Data is persisted
to `server/data/` so restarts keep serving the last good dataset.

API:

- `GET /api/sources` — source metadata + available valid times
- `GET /api/fronts/:sourceId` — full dataset (all timesteps, GeoJSON) for
  `knmi`, `wpc` or `metoffice`
- `GET /health`

### 2. Plugin

```sh
npm install
npm start          # serves the plugin on https://localhost:9999
```

Then open <https://www.windy.com/developer-mode> and load the plugin from
`https://localhost:9999/plugin.js`.

In the plugin you can switch between sources, pick a valid time
(analysis or forecast), follow the Windy timeline, and see the usual front
symbology (triangles = cold, semicircles = warm, alternating = occluded /
stationary, dashed = trough) plus H/L pressure centers.

The plugin talks to `http://localhost:3311` by default; change `BACKEND_URL`
in [src/api.ts](src/api.ts) when you deploy the backend somewhere else (use
https in production — browsers only allow mixed content for localhost).

### Debug tooling

- `cd server && npm run calibrate` — refit the KNMI chart georeferencing.
- `cd server && npm run extract-preview <chart.gif> <out.json>` — dump traced
  front pixel paths for overlaying on the source image.

## Plugin template

This repo is based on the official
[windy-plugin-template](https://github.com/windycom/windy-plugin-template);
the original examples live in `examples/` and the template documentation is at
<https://docs.windy-plugins.com/>. Documentation for the Leaflet GL library is
at <https://windycom.github.io/LeafletGL/docs/>.
