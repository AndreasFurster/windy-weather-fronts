import type { VercelRequest, VercelResponse } from '@vercel/node';
import { chartSources } from '../../../src/charts/sources.js';
import { blobReadJson, blobWriteJson } from '../../../src/blobKv.js';
import { refreshChartSourceToBlob } from '../../../src/charts/blobCollector.js';
import { requireRefreshToken } from '../../../src/refreshAuth.js';
import type { ChartSourceIndex } from '../../../src/charts/types.js';

/**
 * Refreshes one mirrored chart-image source and stores the images + index in
 * Vercel Blob. Called hourly per source by
 * .github/workflows/refresh-fronts.yml (POST, x-refresh-token header) — not
 * meant to be hit from a browser.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireRefreshToken(req, res)) return;

    const sourceId = req.query.sourceId as string;
    const source = chartSources.find(s => s.id === sourceId);
    if (!source) {
        res.status(404).json({ error: `unknown chart source '${sourceId}'` });
        return;
    }

    const started = Date.now();
    const previous = await blobReadJson<ChartSourceIndex>(`charts/meta/${sourceId}.json`);

    const updated = await refreshChartSourceToBlob(source, previous);
    await blobWriteJson(`charts/meta/${sourceId}.json`, updated);

    res.status(updated.available ? 200 : 502).json({
        ok: updated.available,
        sourceId,
        durationMs: Date.now() - started,
        charts: updated.charts.length,
        error: updated.error,
    });
}
