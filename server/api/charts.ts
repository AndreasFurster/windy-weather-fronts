import type { VercelRequest, VercelResponse } from '@vercel/node';
import { blobReadJson } from '../src/blobKv.ts';
import type { ChartSourceIndex } from '../src/charts/types.ts';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=120');
    const index = await blobReadJson<ChartSourceIndex[]>('charts/index.json');
    res.status(200).json(index ?? []);
}
