/**
 * Storage abstraction for the weather-fronts backend.
 *
 * Two implementations exist:
 *  - BlobDataStore  (src/blobDataStore.ts)  — Vercel Blob, used by api/*.ts
 *  - DiskDataStore  (src/diskDataStore.ts)  — local disk, used by src/index.ts
 *
 * All API handler logic lives in src/apiHandlers.ts and operates only against
 * this interface, keeping Vercel and the local Express server in sync.
 */

import type { SourceDataset } from './types.js';
import type { ChartSource, ChartSourceIndex, StoredChart } from './charts/types.js';

export interface IDataStore {
    // --- Fronts data ----------------------------------------------------------
    getFronts(sourceId: string): Promise<SourceDataset | null>;
    putFronts(data: SourceDataset): Promise<void>;

    /** Raw bytes of a mirrored chart image (used by the KNMI process demo). */
    getChartFile(sourceId: string, chart: StoredChart): Promise<Uint8Array | null>;

    // --- Charts metadata ------------------------------------------------------
    listChartsMeta(): Promise<ChartSourceIndex[]>;
    getChartsMeta(sourceId: string): Promise<ChartSourceIndex | null>;
    /** Mirror images for one source and return the updated index entry.
     *  Image files/blobs are stored by the implementation. */
    refreshAndStoreChartImages(
        source: ChartSource,
        previous: ChartSourceIndex | null,
    ): Promise<ChartSourceIndex>;
    putChartsMeta(sourceId: string, data: ChartSourceIndex): Promise<void>;
}
