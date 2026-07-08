# Weather Fronts — Windy plugin

Windy.com plugin that renders weather fronts with classic symbology
(triangles = cold, semicircles = warm, alternating = occluded/stationary,
dashed = trough) plus H/L pressure centers, from the data collected by the
[backend](../server/).

Features:

- Switch between sources: KNMI (Europe), NOAA WPC (North America),
  Met Office (Europe/Atlantic).
- Pick a valid time: analysis or forecast steps, shown in local time
  (UTC toggle available), or follow the Windy timeline automatically.
- H/L pressure centers, including the ones extracted from the KNMI chart.

## Development

```sh
npm install
npm start          # serves https://localhost:9999
```

Start the [backend](../server/) too, then open
<https://www.windy.com/developer-mode> and load
`https://localhost:9999/plugin.js`.

The plugin talks to `http://localhost:3311` by default; change `BACKEND_URL`
in [src/api.ts](src/api.ts) for a deployed backend (must be https in
production — browsers only allow mixed content for localhost).

## Publishing

1. Deploy the backend somewhere reachable over https and update
   `BACKEND_URL` in `src/api.ts`.
2. Optionally replace `src/screenshot.jpg` with a real screenshot of the
   plugin.
3. Build and publish, either with the GitHub Actions workflow
   (`publish-plugin`, needs the `WINDY_API_KEY` secret) or manually:
   `npm run build` (or `npm run build:win` on Windows) and upload per the
   [Windy plugin docs](https://docs.windy-plugins.com/).

The original template examples live in [examples/](examples/).
