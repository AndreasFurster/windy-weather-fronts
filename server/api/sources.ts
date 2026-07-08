import type { VercelRequest, VercelResponse } from '@vercel/node';
import { frontsSources } from '../src/sources/index.js';
import { BlobDataStore } from '../src/blobDataStore.js';
import { handleGetSources } from '../src/apiHandlers.js';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=120');
    const { status, body } = await handleGetSources(new BlobDataStore(), frontsSources);
    res.status(status).json(body);
}
