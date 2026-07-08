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
import type { FrontsSource } from './types.js';
import { Store } from './store.js';
import { frontsSources } from './sources/index.js';
import { ChartCollector } from './charts/collector.js';
import { chartSources } from './charts/sources.js';
import { DiskDataStore } from './diskDataStore.js';
import {
    handleGetSources,
    handleGetFronts,
    handleGetCharts,
    handleRefreshFronts,
    handleRefreshCharts,
    isRefreshTokenValid,
} from './apiHandlers.js';

const PORT = parseInt(process.env.PORT ?? '3311', 10);
const DATA_DIR = process.env.DATA_DIR
    ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const CHARTS_DIR = join(DATA_DIR, 'charts');

// This Express server is the local/Docker entry point (long-running process,
// setInterval scheduler, plain disk storage). The Vercel deployment uses the
// serverless functions under api/ instead (see api/refresh/**), which share
// the same source adapters but persist to Vercel Blob — see server/README.md.
const store = new Store(DATA_DIR);
const chartCollector = new ChartCollector(CHARTS_DIR);
const dataStore = new DiskDataStore(store, chartCollector);

function startScheduler(): void {
    for (const source of frontsSources) {
        void refreshFrontsSource(source);
        setInterval(() => void refreshFrontsSource(source), source.info.refreshMinutes * 60_000);
    }
    for (const source of chartSources) {
        void chartCollector.refresh(source);
        setInterval(
            () => void chartCollector.refresh(source),
            source.refreshMinutes * 60_000,
        );
    }
}

async function refreshFrontsSource(source: FrontsSource): Promise<void> {
    const { id } = source.info;
    try {
        const started = Date.now();
        const result = await source.fetch();
        await store.put({ sourceId: id, fetchedAt: new Date().toISOString(), ...result });
        const nFeatures = result.timesteps.reduce((n, t) => n + t.geojson.features.length, 0);
        console.log(
            `[${id}] refreshed in ${Date.now() - started}ms: ` +
            `${result.timesteps.length} timesteps, ${nFeatures} features`);
    } catch (err) {
        console.error(`[${id}] refresh failed (keeping previous data):`, err);
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
