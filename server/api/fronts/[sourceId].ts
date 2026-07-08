import type { VercelRequest, VercelResponse } from '@vercel/node';
import { frontsSources } from '../../src/sources/index.js';
import { BlobDataStore } from '../../src/blobDataStore.js';
import { handleGetFronts } from '../../src/apiHandlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const sourceId = req.query.sourceId as string;
    const { status, body } = await handleGetFronts(new BlobDataStore(), frontsSources, sourceId);
    if (status === 200) res.setHeader('Cache-Control', 'public, max-age=120');
    res.status(status).json(body);
}
