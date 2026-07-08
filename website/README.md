# Weather Fronts — comparison website

Vite/Vue/TypeScript site showing the front charts of all mirrored sources in
a grid, so the different services can be compared side by side. Images are
served by the [backend](../server/) mirror — never hotlinked from the
original sites.

Features:

- Grid of chart cards with source name, chart label and valid time.
- Filter by source; "Analysis only" toggle for a clean one-card-per-source
  comparison; lightbox on click.
- Times in local timezone by default, with a "Show times in UTC" toggle.
- meteo.be video frames (or the animation itself when the backend has no
  ffmpeg) render inline.
- Attribution and mirror timestamps per source in the footer.

## Development

```sh
npm install
npm run dev        # http://localhost:5173, proxies /api + /charts to :3311
```

The [backend](../server/) must be running on port 3311.

## Production build

```sh
npm run build      # type-checks (vue-tsc) and outputs dist/
```

Serve `dist/` as static files. Either put the site on the same origin as the
backend (reverse proxy `/api` and `/charts` to the backend, mirroring the dev
proxy in [vite.config.ts](vite.config.ts)), or build with
`VITE_BACKEND_URL=https://your-backend.example` to point elsewhere (the
backend sends permissive CORS headers).
