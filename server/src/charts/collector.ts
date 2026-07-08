/**
 * Mirrors chart images to local disk (data/charts/<sourceId>/) and keeps an
 * index of what is available. Files no longer referenced by the source are
 * pruned on each refresh; on failure the previous index entry is kept so the
 * website keeps showing the last good charts.
 */

import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChartSource, ChartSourceIndex, StoredChart } from './types.js';

const IMAGE_MAGIC: number[][] = [
    [0x47, 0x49, 0x46], // GIF
    [0x89, 0x50, 0x4e, 0x47], // PNG
    [0xff, 0xd8], // JPEG
];

export function looksLikeImage(buf: Uint8Array): boolean {
    return IMAGE_MAGIC.some(magic => magic.every((b, i) => buf[i] === b));
}

/** MP4-family containers carry 'ftyp' at byte offset 4. */
export function looksLikeVideo(buf: Uint8Array): boolean {
    return buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
}

export function safeFileName(url: string, index: number): string {
    const base = (new URL(url).pathname.split('/').pop() ?? `chart-${index}`)
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '_');
    return base || `chart-${index}`;
}

export class ChartCollector {
    private index = new Map<string, ChartSourceIndex>();
    private chartsDir: string;

    constructor(chartsDir: string) {
        this.chartsDir = chartsDir;
    }

    /** Reload the persisted index so restarts keep serving mirrored charts. */
    async load(): Promise<void> {
        await mkdir(this.chartsDir, { recursive: true });
        try {
            const raw = await readFile(join(this.chartsDir, 'index.json'), 'utf8');
            for (const entry of JSON.parse(raw) as ChartSourceIndex[]) {
                this.index.set(entry.id, entry);
            }
        } catch {
            // no index yet
        }
    }

    list(): ChartSourceIndex[] {
        return [...this.index.values()];
    }

    async refresh(source: ChartSource): Promise<void> {
        const previous = this.index.get(source.id);
        try {
            const images = await source.list();
            const dir = join(this.chartsDir, source.id);
            await mkdir(dir, { recursive: true });

            const charts: StoredChart[] = [];
            const keep = new Set<string>();

            for (const [i, img] of images.entries()) {
                let file = img.fileName ?? safeFileName(img.url, i);
                if (keep.has(file)) file = `${i}-${file}`;
                const mediaType = img.mediaType ?? 'image';

                let buf = img.data;
                if (!buf) {
                    const res = await fetch(img.url, {
                        headers: { 'user-agent': 'windy-weather-fronts (chart mirror)' },
                    });
                    if (!res.ok) {
                        console.warn(`[charts:${source.id}] HTTP ${res.status} for ${img.url}`);
                        continue;
                    }
                    buf = new Uint8Array(await res.arrayBuffer());
                }
                const valid = mediaType === 'video' ? looksLikeVideo(buf) : looksLikeImage(buf);
                if (buf.length < 2000 || !valid) {
                    console.warn(`[charts:${source.id}] not a valid ${mediaType}: ${img.url}`);
                    continue;
                }
                await writeFile(join(dir, file), buf);
                keep.add(file);
                charts.push({
                    file,
                    label: img.label,
                    validTime: img.validTime,
                    forecastHours: img.forecastHours,
                    mediaType,
                    originUrl: img.url,
                    url: `/charts/${source.id}/${file}`,
                });
            }

            if (!charts.length) throw new Error('no images could be mirrored');

            // Prune files that are no longer part of the current chart set.
            for (const existing of await readdir(dir)) {
                if (!keep.has(existing)) {
                    await unlink(join(dir, existing)).catch(() => {});
                }
            }

            this.index.set(source.id, {
                id: source.id,
                name: source.name,
                region: source.region,
                attribution: source.attribution,
                pageUrl: source.pageUrl,
                available: true,
                fetchedAt: new Date().toISOString(),
                charts,
            });
            console.log(`[charts:${source.id}] mirrored ${charts.length} images`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (previous?.available) {
                console.warn(`[charts:${source.id}] refresh failed, keeping previous set: ${message}`);
                return;
            }
            this.index.set(source.id, {
                id: source.id,
                name: source.name,
                region: source.region,
                attribution: source.attribution,
                pageUrl: source.pageUrl,
                available: false,
                fetchedAt: null,
                error: message,
                charts: [],
            });
            console.warn(`[charts:${source.id}] unavailable: ${message}`);
        }
        await this.persist();
    }

    private async persist(): Promise<void> {
        try {
            await writeFile(
                join(this.chartsDir, 'index.json'),
                JSON.stringify(this.list()),
                'utf8',
            );
        } catch (err) {
            console.warn('[charts] could not persist index:', err);
        }
    }
}
