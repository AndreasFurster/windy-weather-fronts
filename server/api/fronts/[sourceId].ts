import type { VercelRequest, VercelResponse } from '@vercel/node';
import { frontsSources } from '../../src/sources/index.js';
import { blobReadJson } from '../../src/blobKv.js';
import type { SourceDataset } from '../../src/types.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const sourceId = req.query.sourceId as string;
    const source = frontsSources.find(s => s.info.id === sourceId);
    if (!source) {
        res.status(404).json({ error: `unknown source '${sourceId}'` });
        return;
    }

    const dataset = await blobReadJson<SourceDataset>(`fronts/${sourceId}.json`);
    if (!dataset) {
        res.status(503).json({ error: 'no data collected yet, try again shortly' });
        return;
    }
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.status(200).json({ ...source.info, ...dataset });
}
