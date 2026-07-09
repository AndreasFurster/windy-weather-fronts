/**
 * Minimal JSON key/value helpers on top of Vercel Blob, used by the
 * serverless functions in server/api/ (see also charts/blobCollector.ts for
 * binary chart mirroring). The local/Docker Express server does not use this
 * module — it keeps using plain disk storage via store.ts and
 * charts/collector.ts, since it is a long-running process with a normal
 * filesystem.
 *
 * Pathnames are written with `addRandomSuffix: false, allowOverwrite: true`
 * so each key maps to one stable blob that gets overwritten on refresh,
 * rather than accumulating a new object (and a new URL) every time.
 */

import { list, put } from '@vercel/blob';

export async function blobReadJson<T>(pathname: string): Promise<T | null> {
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const match = blobs.find(b => b.pathname === pathname);
    if (!match) return null;
    const res = await fetch(match.url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
}

export async function blobWriteJson(pathname: string, value: unknown): Promise<void> {
    await put(pathname, JSON.stringify(value), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
    });
}

/**
 * Reads every JSON blob under a prefix. Used instead of one shared "index"
 * document so that parallel refreshes of different sources never race to
 * read-modify-write the same key (each source writes only its own blob).
 */
export async function blobListJson<T>(prefix: string): Promise<T[]> {
    const { blobs } = await list({ prefix });
    const results: (T | null)[] = await Promise.all(blobs.map(
        async (b): Promise<T | null> => {
            const res = await fetch(b.url, { cache: 'no-store' });
            return res.ok ? (await res.json()) as T : null;
        },
    ));
    return results.filter((v): v is T => v !== null);
}
