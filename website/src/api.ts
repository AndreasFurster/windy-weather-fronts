/** Client for the backend chart-mirror API (server/src/charts/). */

export interface StoredChart {
    /** Local (mirrored) image URL, served by the backend. */
    url: string;
    file: string;
    label: string;
    validTime?: string;
    forecastHours?: number;
    mediaType: 'image' | 'video';
    originUrl: string;
}

export interface ChartSourceIndex {
    id: string;
    name: string;
    region: string;
    attribution: string;
    pageUrl: string;
    available: boolean;
    fetchedAt: string | null;
    error?: string;
    charts: StoredChart[];
}

const BACKEND_URL: string = import.meta.env.VITE_BACKEND_URL ?? '';

export function chartUrl(chart: StoredChart): string {
    // The Vercel/Blob backend returns absolute CDN URLs already; the local/fs
    // backend returns a relative /charts/... path that needs the API host.
    return /^https?:\/\//.test(chart.url) ? chart.url : `${BACKEND_URL}${chart.url}`;
}

export async function fetchChartSources(): Promise<ChartSourceIndex[]> {
    const res = await fetch(`${BACKEND_URL}/api/charts`);
    if (!res.ok) throw new Error(`Backend error: HTTP ${res.status}`);
    return res.json();
}
