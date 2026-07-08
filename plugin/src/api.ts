import type { SourceDataset, SourceListing } from './frontTypes';

/**
 * Base URL of the fronts backend (see the `server/` directory of this repo).
 * For local development the backend runs on http://localhost:3311; browsers
 * treat localhost as a secure origin, so windy.com (https) may fetch from it.
 * Point this at an https deployment for production use.
 */
export const BACKEND_URL = 'http://localhost:3311';

export async function fetchSources(): Promise<SourceListing[]> {
    const res = await fetch(`${BACKEND_URL}/api/sources`);
    if (!res.ok) throw new Error(`Backend error: HTTP ${res.status}`);
    return res.json();
}

export async function fetchFronts(sourceId: string): Promise<SourceDataset> {
    const res = await fetch(`${BACKEND_URL}/api/fronts/${sourceId}`);
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Backend error: HTTP ${res.status}`);
    }
    return res.json();
}
