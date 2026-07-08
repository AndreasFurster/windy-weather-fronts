/**
 * In-memory dataset store with JSON persistence, so a restart keeps serving
 * the last good data while sources refresh in the background.
 */

import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { SourceDataset } from './types.ts';

export class Store {
    private datasets = new Map<string, SourceDataset>();
    private dataDir: string;

    constructor(dataDir: string) {
        this.dataDir = dataDir;
    }

    async load(): Promise<void> {
        await mkdir(this.dataDir, { recursive: true });
        let files: string[] = [];
        try {
            files = await readdir(this.dataDir);
        } catch {
            return;
        }
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
                const raw = await readFile(join(this.dataDir, file), 'utf8');
                const dataset = JSON.parse(raw) as SourceDataset;
                if (dataset.sourceId) this.datasets.set(dataset.sourceId, dataset);
            } catch (err) {
                console.warn(`[store] could not load ${file}:`, err);
            }
        }
    }

    get(sourceId: string): SourceDataset | undefined {
        return this.datasets.get(sourceId);
    }

    async put(dataset: SourceDataset): Promise<void> {
        this.datasets.set(dataset.sourceId, dataset);
        try {
            await writeFile(
                join(this.dataDir, `${dataset.sourceId}.json`),
                JSON.stringify(dataset),
                'utf8',
            );
        } catch (err) {
            console.warn(`[store] could not persist ${dataset.sourceId}:`, err);
        }
    }
}
