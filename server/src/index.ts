/**
 * Weather fronts backend: refreshes all sources on an interval and serves the
 * collected data over a small JSON API.
 *
 * Vectorized front geometry (for the Windy plugin):
 *   GET /api/sources            source metadata + available valid times
 *   GET /api/fronts/:sourceId   full dataset (all timesteps) for one source
 *
 * Mirrored chart images (for the comparison website; no hotlinking):
 *   GET /api/charts             per-source metadata + local image URLs
 *   GET /charts/<source>/<file> the mirrored images themselves
 *
 *   GET /health
 */

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Store } from './store.js';
import { frontsSources } from './sources/index.js';
import { ChartCollector } from './charts/collector.js';
import { chartSources } from './charts/sources.js';
import { DiskDataStore } from './diskDataStore.js';
import {
    handleGetSources,
    handleGetFronts,
    handleGetCharts,
    handleKnmiProcess,
    handleRefreshFronts,
    handleRefreshCharts,
    handleRefreshAll,
    isRefreshTokenValid,
} from './apiHandlers.js';

const PORT = parseInt(process.env.PORT ?? '3311', 10);
const DATA_DIR = process.env.DATA_DIR
    ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const CHARTS_DIR = join(DATA_DIR, 'charts');
const CHARTS_META_DIR = join(CHARTS_DIR, 'meta');

// This Express server is the local/Docker entry point (long-running process,
// setInterval scheduler, plain disk storage). The Vercel deployment uses the
// serverless functions under api/ instead (see api/refresh/**), which share
// the same source adapters but persist to Vercel Blob — see server/README.md.
const store = new Store(DATA_DIR);
const chartCollector = new ChartCollector(CHARTS_DIR);
const dataStore = new DiskDataStore(store, chartCollector, CHARTS_META_DIR);

// The scheduler goes through the same handlers as the HTTP refresh endpoints
// so that everything they persist (including the per-source charts meta files
// that /api/charts and /api/knmi/process read) stays in sync.
function startScheduler(): void {
    for (const source of frontsSources) {
        const run = (): void => {
            void handleRefreshFronts(dataStore, frontsSources, source.info.id);
        };
        run();
        setInterval(run, source.info.refreshMinutes * 60_000);
    }
    for (const source of chartSources) {
        const run = (): void => {
            void handleRefreshCharts(dataStore, chartSources, source.id).catch(err =>
                console.error(`[charts:${source.id}] scheduled refresh failed:`, err));
        };
        run();
        setInterval(run, source.refreshMinutes * 60_000);
    }
}

const app = express();

// The Windy plugin runs on windy.com; allow cross-origin reads.
app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/sources', async (_req, res) => {
    const { status, body } = await handleGetSources(dataStore, frontsSources);
    res.status(status).json(body);
});

app.get('/api/charts', async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=120');
    const { status, body } = await handleGetCharts(dataStore);
    res.status(status).json(body);
});

app.use('/charts', express.static(CHARTS_DIR, {
    maxAge: '10m',
    index: false,
    setHeaders: res => res.setHeader('Access-Control-Allow-Origin', '*'),
}));

app.get('/api/fronts/:sourceId', async (req, res) => {
    const { status, body } = await handleGetFronts(dataStore, frontsSources, req.params.sourceId);
    if (status === 200) res.setHeader('Cache-Control', 'public, max-age=120');
    res.status(status).json(body);
});

app.get('/api/knmi/process', async (_req, res) => {
    const { status, body } = await handleKnmiProcess(dataStore);
    if (status === 200) res.setHeader('Cache-Control', 'public, max-age=600');
    res.status(status).json(body);
});

app.get('/api/refresh', async (req, res) => {
    if (!isRefreshTokenValid(req.headers['x-refresh-token'])) {
        res.status(401).json({ error: 'invalid or missing x-refresh-token header' });
        return;
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Accel-Buffering', 'no'); // prevent nginx/proxy buffering
    res.flushHeaders();

    await handleRefreshAll(dataStore, frontsSources, chartSources, r => {
        const icon = r.status < 400 ? '✓' : '✗';
        res.write(`${icon} [${r.type}/${r.sourceId}] ${JSON.stringify(r.body)}\n`);
    });

    res.end('\ndone\n');
});

app.post('/api/refresh/fronts/:sourceId', async (req, res) => {
    if (!isRefreshTokenValid(req.headers['x-refresh-token'])) {
        res.status(401).json({ error: 'invalid or missing x-refresh-token header' });
        return;
    }
    const { status, body } = await handleRefreshFronts(dataStore, frontsSources, req.params.sourceId);
    res.status(status).json(body);
});

app.post('/api/refresh/charts/:sourceId', async (req, res) => {
    if (!isRefreshTokenValid(req.headers['x-refresh-token'])) {
        res.status(401).json({ error: 'invalid or missing x-refresh-token header' });
        return;
    }
    const { status, body } = await handleRefreshCharts(dataStore, chartSources, req.params.sourceId);
    res.status(status).json(body);
});

await store.load();
await chartCollector.load();
app.listen(PORT, () => {
    console.log(`weather-fronts backend listening on http://localhost:${PORT}`);
    startScheduler();
});
