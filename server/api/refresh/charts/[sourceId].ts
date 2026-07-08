import type { VercelRequest, VercelResponse } from '@vercel/node';
import { chartSources } from '../../../src/charts/sources.ts';
import { blobReadJson, blobWriteJson } from '../../../src/blobKv.ts';
import { refreshChartSourceToBlob } from '../../../src/charts/blobCollector.ts';
import { requireRefreshToken } from '../../../src/refreshAuth.ts';
import type { ChartSourceIndex } from '../../../src/charts/types.ts';

/**
 * Refreshes one mirrored chart-image source and stores the images + index in
 * Vercel Blob. Called hourly per source by
 * .github/workflows/refresh-fronts.yml (POST, x-refresh-token header) — not
 * meant to be hit from a browser.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'use POST' });
        return;
    }
    if (!requireRefreshToken(req, res)) return;

    const sourceId = req.query.sourceId as string;
    const source = chartSources.find(s => s.id === sourceId);
    if (!source) {
        res.status(404).json({ error: `unknown chart source '${sourceId}'` });
        return;
    }

    const started = Date.now();
    const index = (await blobReadJson<ChartSourceIndex[]>('charts/index.json')) ?? [];
    const previous = index.find(e => e.id === sourceId) ?? null;

    const updated = await refreshChartSourceToBlob(source, previous);
    const nextIndex = [...index.filter(e => e.id !== sourceId), updated];
    await blobWriteJson('charts/index.json', nextIndex);

    res.status(updated.available ? 200 : 502).json({
        ok: updated.available,
        sourceId,
        durationMs: Date.now() - started,
        charts: updated.charts.length,
        error: updated.error,
    });
}
