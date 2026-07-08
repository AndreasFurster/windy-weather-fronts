import type { VercelRequest, VercelResponse } from '@vercel/node';
import { frontsSources } from '../src/sources/index.js';
import { chartSources } from '../src/charts/sources.js';
import { BlobDataStore } from '../src/blobDataStore.js';
import { handleRefreshAll, isRefreshTokenValid } from '../src/apiHandlers.js';

/**
 * Refreshes all fronts + chart sources in one call. Useful for manual
 * triggers; the scheduled workflow calls each source endpoint separately.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!isRefreshTokenValid(req.headers['x-refresh-token'])) {
        res.status(401).json({ error: 'invalid or missing x-refresh-token header' });
        return;
    }
    const results = await handleRefreshAll(new BlobDataStore(), frontsSources, chartSources);
    const ok = results.every(r => r.status < 400);
    res.status(ok ? 200 : 502).json({ ok, results });
}
