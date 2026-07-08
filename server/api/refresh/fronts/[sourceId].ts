import type { VercelRequest, VercelResponse } from '@vercel/node';
import { frontsSources } from '../../../src/sources/index.js';
import { blobWriteJson } from '../../../src/blobKv.js';
import { requireRefreshToken } from '../../../src/refreshAuth.js';

/**
 * Refreshes one vectorized front-geometry source and stores it in Vercel
 * Blob. Called hourly per source by .github/workflows/refresh-fronts.yml
 * (POST, x-refresh-token header) — not meant to be hit from a browser.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'use POST' });
        return;
    }
    if (!requireRefreshToken(req, res)) return;

    const sourceId = req.query.sourceId as string;
    const source = frontsSources.find(s => s.info.id === sourceId);
    if (!source) {
        res.status(404).json({ error: `unknown source '${sourceId}'` });
        return;
    }

    const started = Date.now();
    try {
        const result = await source.fetch();
        await blobWriteJson(`fronts/${sourceId}.json`, {
            sourceId,
            fetchedAt: new Date().toISOString(),
            ...result,
        });
        const nFeatures = result.timesteps.reduce((n, t) => n + t.geojson.features.length, 0);
        console.log(`[${sourceId}] refreshed in ${Date.now() - started}ms: `
            + `${result.timesteps.length} timesteps, ${nFeatures} features`);
        res.status(200).json({
            ok: true,
            sourceId,
            durationMs: Date.now() - started,
            timesteps: result.timesteps.length,
            features: nFeatures,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[${sourceId}] refresh failed:`, message);
        res.status(502).json({ ok: false, sourceId, error: message });
    }
}
