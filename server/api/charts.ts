import type { VercelRequest, VercelResponse } from '@vercel/node';
import { blobListJson } from '../src/blobKv.js';
import type { ChartSourceIndex } from '../src/charts/types.js';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=120');
    // One charts/meta/<sourceId>.json blob per source (see
    // api/refresh/charts/[sourceId].ts) rather than one shared index, so
    // parallel refreshes can never clobber each other's results.
    const index = await blobListJson<ChartSourceIndex>('charts/meta/');
    res.status(200).json(index);
}
