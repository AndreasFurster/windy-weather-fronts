/**
 * IDataStore implementation backed by Vercel Blob — used by the serverless
 * functions under api/*.ts. No persistent disk is available in that runtime.
 */

import type { SourceDataset } from './types.js';
import type { ChartSource, ChartSourceIndex, StoredChart } from './charts/types.js';
import type { IDataStore } from './dataStore.js';
import { blobReadJson, blobWriteJson, blobListJson } from './blobKv.js';
import { refreshChartSourceToBlob } from './charts/blobCollector.js';

export class BlobDataStore implements IDataStore {
    async getFronts(sourceId: string): Promise<SourceDataset | null> {
        return blobReadJson<SourceDataset>(`fronts/${sourceId}.json`);
    }

    async getChartFile(_sourceId: string, chart: StoredChart): Promise<Uint8Array | null> {
        // Blob chart URLs are absolute CDN URLs.
        const res = await fetch(chart.url, { cache: 'no-store' });
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
    }

    async putFronts(data: SourceDataset): Promise<void> {
        await blobWriteJson(`fronts/${data.sourceId}.json`, data);
    }

    async listChartsMeta(): Promise<ChartSourceIndex[]> {
        return blobListJson<ChartSourceIndex>('charts/meta/');
    }

    async getChartsMeta(sourceId: string): Promise<ChartSourceIndex | null> {
        return blobReadJson<ChartSourceIndex>(`charts/meta/${sourceId}.json`);
    }

    async refreshAndStoreChartImages(
        source: ChartSource,
        previous: ChartSourceIndex | null,
    ): Promise<ChartSourceIndex> {
        return refreshChartSourceToBlob(source, previous);
    }

    async putChartsMeta(sourceId: string, data: ChartSourceIndex): Promise<void> {
        await blobWriteJson(`charts/meta/${sourceId}.json`, data);
    }
}
