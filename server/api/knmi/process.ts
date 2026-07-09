import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BlobDataStore } from '../../src/blobDataStore.js';
import { handleKnmiProcess } from '../../src/apiHandlers.js';

/**
 * Step-by-step extraction data for the website's KNMI process page. The
 * extraction runs on demand against the latest mirrored chart; CDN caching
 * keeps that to at most once per 10 minutes.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { status, body } = await handleKnmiProcess(new BlobDataStore());
    if (status === 200) {
        res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600');
    }
    res.status(status).json(body);
}
