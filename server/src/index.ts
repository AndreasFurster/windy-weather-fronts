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
import type { FrontsSource } from './types.ts';
import { Store } from './store.ts';
import { knmiSource } from './sources/knmi.ts';
import { wpcSource } from './sources/wpc.ts';
import { metofficeSource } from './sources/metoffice.ts';
import { ChartCollector } from './charts/collector.ts';
import { chartSources } from './charts/sources.ts';

const PORT = parseInt(process.env.PORT ?? '3311', 10);
const DATA_DIR = process.env.DATA_DIR
    ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const CHARTS_DIR = join(DATA_DIR, 'charts');

const sources: FrontsSource[] = [knmiSource, wpcSource, metofficeSource];
const store = new Store(DATA_DIR);
const chartCollector = new ChartCollector(CHARTS_DIR);

async function refreshSource(source: FrontsSource): Promise<void> {
    const { id } = source.info;
    try {
        const started = Date.now();
        const result = await source.fetch();
        await store.put({
            sourceId: id,
            fetchedAt: new Date().toISOString(),
            ...result,
        });
        const nFeatures = result.timesteps.reduce((n, t) => n + t.geojson.features.length, 0);
        console.log(
            `[${id}] refreshed in ${Date.now() - started}ms: ` +
            `${result.timesteps.length} timesteps, ${nFeatures} features`);
    } catch (err) {
        console.error(`[${id}] refresh failed (keeping previous data):`, err);
    }
}

function startScheduler(): void {
    for (const source of sources) {
        void refreshSource(source);
        setInterval(() => void refreshSource(source), source.info.refreshMinutes * 60_000);
    }
    for (const source of chartSources) {
        void chartCollector.refresh(source);
        setInterval(
            () => void chartCollector.refresh(source),
            source.refreshMinutes * 60_000,
        );
    }
}

const app = express();

// The Windy plugin runs on windy.com; allow cross-origin reads.
app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    next();
});

app.get('/health', (_req, res) => {
    res.json({ ok: true });
});

app.get('/api/sources', (_req, res) => {
    res.json(sources.map(s => {
        const dataset = store.get(s.info.id);
        return {
            ...s.info,
            available: Boolean(dataset && dataset.timesteps.length),
            issuedTime: dataset?.issuedTime ?? null,
            fetchedAt: dataset?.fetchedAt ?? null,
            times: dataset?.timesteps.map(t => ({
                validTime: t.validTime,
                forecastHours: t.forecastHours,
            })) ?? [],
        };
    }));
});

app.get('/api/charts', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.json(chartCollector.list().map(entry => ({
        ...entry,
        charts: entry.charts.map(c => ({
            ...c,
            url: `/charts/${entry.id}/${c.file}`,
        })),
    })));
});

app.use('/charts', express.static(CHARTS_DIR, {
    maxAge: '10m',
    index: false,
    setHeaders: res => res.setHeader('Access-Control-Allow-Origin', '*'),
}));

app.get('/api/fronts/:sourceId', (req, res) => {
    const source = sources.find(s => s.info.id === req.params.sourceId);
    if (!source) {
        res.status(404).json({ error: `unknown source '${req.params.sourceId}'` });
        return;
    }
    const dataset = store.get(source.info.id);
    if (!dataset) {
        res.status(503).json({ error: 'no data collected yet, try again shortly' });
        return;
    }
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.json({ ...source.info, ...dataset });
});

await store.load();
await chartCollector.load();
app.listen(PORT, () => {
    console.log(`weather-fronts backend listening on http://localhost:${PORT}`);
    startScheduler();
});
