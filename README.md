# Windy Weather Fronts

Weather fronts from multiple (mostly European) weather services, in three
parts:

| Part | Description |
| --- | --- |
| [`server/`](server/) | Node.js backend: periodically collects front data (vectorized GeoJSON + mirrored chart images) and serves it over a JSON API |
| [`plugin/`](plugin/) | Windy.com plugin: renders fronts and H/L pressure centers on the Windy map with classic front symbology |
| [`website/`](website/) | Vite/Vue/TS site: chart comparison grid, plus a `/plugin` page that demonstrates the KNMI extraction step by step on the latest chart |

A concise architecture guide aimed at LLMs (and humans in a hurry) lives in
[CLAUDE.md](CLAUDE.md).

```
KNMI chart images ────┐ (color masking, thinning,
                      │  tracing, georeferencing)
NOAA WPC bulletins ───┤
Met Office IAC ───────┼─► server/ ──► GeoJSON API ───► plugin/  (Windy map)
meteo.be video ───────┤            └► mirrored     ──► website/ (chart grid)
DWD / AEMET /         │               chart images
Met Office / MF images┘
```

## Quick start

```sh
# 1. Backend (Node.js >= 23.6; ffmpeg optional, used for meteo.be frames)
cd server && npm install && npm start        # http://localhost:3311

# 2. Website
cd website && npm install && npm run dev     # http://localhost:5173

# 3. Windy plugin
cd plugin && npm install && npm start        # https://localhost:9999
#    then load https://localhost:9999/plugin.js at windy.com/developer-mode
```

Each part has its own README with details, publishing/deployment steps and
data-source documentation.

## Data sources

**Vectorized front geometry** (shown in the Windy plugin):

- **KNMI** — fronts + H/L pressure centers are vectorized from the published
  chart images (KNMI does not publish the raw geometry); approximate.
- **NOAA WPC** — coded surface bulletins (CODSUS/CODSRP), exact.
- **Met Office** — IAC FLEET analysis (ASXX21 EGRR), exact.

**Mirrored chart images** (shown on the website; downloaded by the backend,
never hotlinked): KNMI, KMI/RMI (meteo.be, frames extracted from their MP4
animation with ffmpeg), DWD, Met Office, AEMET, wetterpate.de (FU Berlin) and
Météo-France (requires `METEOFRANCE_TOKEN`, otherwise reported unavailable).

All displayed times are local; both the website and the plugin have a
"Show times in UTC" toggle.
