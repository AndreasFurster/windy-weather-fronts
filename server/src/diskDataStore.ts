/**
 * IDataStore implementation backed by local disk — used by the long-running
 * Express server in src/index.ts. Delegates to Store (fronts JSON files) and
 * ChartCollector (chart images + in-memory index).
 */

import type { SourceDataset } from './types.js';
import type { ChartSource, ChartSourceIndex } from './charts/types.js';
import type { IDataStore } from './dataStore.js';
import type { Store } from './store.js';
import type { ChartCollector } from './charts/collector.js';

export class DiskDataStore implements IDataStore {
    private store: Store;
    private chartCollector: ChartCollector;

    constructor(store: Store, chartCollector: ChartCollector) {
        this.store = store;
        this.chartCollector = chartCollector;
    }

    async getFronts(sourceId: string): Promise<SourceDataset | null> {
        return this.store.get(sourceId) ?? null;
    }

    async putFronts(data: SourceDataset): Promise<void> {
        await this.store.put(data);
    }

    async listChartsMeta(): Promise<ChartSourceIndex[]> {
        return this.chartCollector.list();
    }

    async getChartsMeta(sourceId: string): Promise<ChartSourceIndex | null> {
        return this.chartCollector.list().find(e => e.id === sourceId) ?? null;
    }

    async refreshAndStoreChartImages(
        source: ChartSource,
        _previous: ChartSourceIndex | null,
    ): Promise<ChartSourceIndex> {
        await this.chartCollector.refresh(source);
        const entry = this.chartCollector.list().find(e => e.id === source.id);
        if (!entry) throw new Error(`no index entry found after refresh for '${source.id}'`);
        return entry;
    }

    /** No-op: ChartCollector manages its own in-memory + disk state. */
    async putChartsMeta(_sourceId: string, _data: ChartSourceIndex): Promise<void> {}
}
