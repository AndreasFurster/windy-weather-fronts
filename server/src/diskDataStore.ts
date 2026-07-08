/**
 * IDataStore implementation backed by local disk — used by the long-running
 * Express server in src/index.ts. Delegates to Store (fronts JSON files) and
 * ChartCollector (chart images). Chart metadata is persisted as individual
 * JSON files under chartsMetaDir (<DATA_DIR>/charts/meta/<sourceId>.json),
 * mirroring the Vercel Blob layout (charts/meta/<sourceId>.json) exactly so
 * both environments behave identically.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SourceDataset } from './types.js';
import type { ChartSource, ChartSourceIndex } from './charts/types.js';
import type { IDataStore } from './dataStore.js';
import type { Store } from './store.js';
import type { ChartCollector } from './charts/collector.js';

export class DiskDataStore implements IDataStore {
    private store: Store;
    private chartCollector: ChartCollector;
    private chartsMetaDir: string;

    constructor(store: Store, chartCollector: ChartCollector, chartsMetaDir: string) {
        this.store = store;
        this.chartCollector = chartCollector;
        this.chartsMetaDir = chartsMetaDir;
    }

    async getFronts(sourceId: string): Promise<SourceDataset | null> {
        return this.store.get(sourceId) ?? null;
    }

    async putFronts(data: SourceDataset): Promise<void> {
        await this.store.put(data);
    }

    async listChartsMeta(): Promise<ChartSourceIndex[]> {
        try {
            const files = await readdir(this.chartsMetaDir);
            const entries = await Promise.all(
                files
                    .filter(f => f.endsWith('.json'))
                    .map(async f => {
                        try {
                            const raw = await readFile(join(this.chartsMetaDir, f), 'utf8');
                            return JSON.parse(raw) as ChartSourceIndex;
                        } catch {
                            return null;
                        }
                    }),
            );
            return entries.filter((e): e is ChartSourceIndex => e !== null);
        } catch {
            return []; // directory doesn't exist yet
        }
    }

    async getChartsMeta(sourceId: string): Promise<ChartSourceIndex | null> {
        try {
            const raw = await readFile(join(this.chartsMetaDir, `${sourceId}.json`), 'utf8');
            return JSON.parse(raw) as ChartSourceIndex;
        } catch {
            return null;
        }
    }

    async refreshAndStoreChartImages(
        source: ChartSource,
        previous: ChartSourceIndex | null,
    ): Promise<ChartSourceIndex> {
        await this.chartCollector.refresh(source, previous ?? undefined);
        const entry = this.chartCollector.list().find(e => e.id === source.id);
        if (!entry) throw new Error(`no index entry found after refresh for '${source.id}'`);
        return entry;
    }

    async putChartsMeta(sourceId: string, data: ChartSourceIndex): Promise<void> {
        await mkdir(this.chartsMetaDir, { recursive: true });
        await writeFile(
            join(this.chartsMetaDir, `${sourceId}.json`),
            JSON.stringify(data),
            'utf8',
        );
    }
}

