import type { VercelRequest, VercelResponse } from '@vercel/node';
import { frontsSources } from '../src/sources/index.js';
import { blobReadJson } from '../src/blobKv.js';
import type { SourceDataset } from '../src/types.js';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=120');

    const payload = await Promise.all(frontsSources.map(async s => {
        const dataset = await blobReadJson<SourceDataset>(`fronts/${s.info.id}.json`);
        return {
            ...s.info,
            available: Boolean(dataset && dataset.timesteps.length),
            issuedTime: dataset?.issuedTime ?? null,
            fetchedAt: dataset?.fetchedAt ?? null,
            times: dataset?.timesteps.map(t => ({
                validTime: t.validTime,
                forecastHours: t.forecastHours,
            })) ?? [],
        };
    }));
    res.status(200).json(payload);
}
