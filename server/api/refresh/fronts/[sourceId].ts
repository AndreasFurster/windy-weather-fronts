import type { VercelRequest, VercelResponse } from '@vercel/node';
import { frontsSources } from '../../../src/sources/index.js';
import { BlobDataStore } from '../../../src/blobDataStore.js';
import { handleRefreshFronts, isRefreshTokenValid } from '../../../src/apiHandlers.js';

/**
 * Refreshes one vectorized front-geometry source and stores it in Vercel
 * Blob. Called hourly per source by .github/workflows/refresh-fronts.yml
 * (POST, x-refresh-token header) — not meant to be hit from a browser.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!isRefreshTokenValid(req.headers['x-refresh-token'])) {
        res.status(401).json({ error: 'invalid or missing x-refresh-token header' });
        return;
    }
    const sourceId = req.query.sourceId as string;
    const { status, body } = await handleRefreshFronts(new BlobDataStore(), frontsSources, sourceId);
    res.status(status).json(body);
}
