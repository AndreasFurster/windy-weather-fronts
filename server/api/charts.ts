import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BlobDataStore } from '../src/blobDataStore.js';
import { handleGetCharts } from '../src/apiHandlers.js';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=120');
    const { status, body } = await handleGetCharts(new BlobDataStore());
    res.status(status).json(body);
}
