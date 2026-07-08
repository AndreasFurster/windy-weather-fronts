import type { SourceDataset, SourceListing } from './frontTypes';

/**
 * Base URL of the fronts backend (see the `server/` directory of this repo),
 * deployed on Vercel. For local development against `npm start` in
 * `server/`, temporarily change this to http://localhost:3311 (browsers
 * treat localhost as a secure origin, so windy.com/developer-mode may still
 * fetch from it over http).
 */
export const BACKEND_URL = 'https://weather-fronts-server.vercel.app';

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
