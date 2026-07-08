/**
 * Blob-backed variant of ChartCollector (collector.ts) for the Vercel
 * deployment: Vercel serverless functions have no writable persistent disk,
 * so mirrored images and the source index live in Vercel Blob instead of
 * data/charts/. Used by server/api/refresh/charts/[sourceId].ts.
 *
 * Unlike the fs-backed collector this refreshes one source per call (the
 * GitHub Actions workflow calls each source's endpoint separately, so a slow
 * or failing source can't block the others or blow a function's time limit).
 */

import { del, list, put } from '@vercel/blob';
import type { ChartSource, ChartSourceIndex, StoredChart } from './types.js';
import { looksLikeImage, looksLikeVideo, safeFileName } from './collector.js';

function contentTypeFor(fileName: string, mediaType: 'image' | 'video'): string {
    if (mediaType === 'video') return 'video/mp4';
    if (fileName.endsWith('.png')) return 'image/png';
    if (fileName.endsWith('.gif')) return 'image/gif';
    if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) return 'image/jpeg';
    return 'application/octet-stream';
}

export async function refreshChartSourceToBlob(
    source: ChartSource,
    previous: ChartSourceIndex | null,
): Promise<ChartSourceIndex> {
    const prefix = `charts/${source.id}/`;
    try {
        const images = await source.list();
        const charts: StoredChart[] = [];
        const keep = new Set<string>(); // bare filenames within this source

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

            const blob = await put(`${prefix}${file}`, Buffer.from(buf), {
                access: 'public',
                addRandomSuffix: false,
                allowOverwrite: true,
                contentType: contentTypeFor(file, mediaType),
            });
            keep.add(file);
            charts.push({
                file,
                label: img.label,
                validTime: img.validTime,
                forecastHours: img.forecastHours,
                mediaType,
                originUrl: img.url,
                url: blob.url,
            });
        }

        if (!charts.length) throw new Error('no images could be mirrored');

        // Prune blobs from a previous refresh that are no longer current.
        const { blobs } = await list({ prefix });
        const keepPathnames = new Set([...keep].map(f => `${prefix}${f}`));
        await Promise.all(
            blobs
                .filter(b => !keepPathnames.has(b.pathname))
                .map(b => del(b.url).catch(() => {})),
        );

        console.log(`[charts:${source.id}] mirrored ${charts.length} images to Blob`);
        return {
            id: source.id,
            name: source.name,
            region: source.region,
            attribution: source.attribution,
            pageUrl: source.pageUrl,
            available: true,
            fetchedAt: new Date().toISOString(),
            charts,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (previous?.available) {
            console.warn(`[charts:${source.id}] refresh failed, keeping previous set: ${message}`);
            return previous;
        }
        console.warn(`[charts:${source.id}] unavailable: ${message}`);
        return {
            id: source.id,
            name: source.name,
            region: source.region,
            attribution: source.attribution,
            pageUrl: source.pageUrl,
            available: false,
            fetchedAt: null,
            error: message,
            charts: [],
        };
    }
}
