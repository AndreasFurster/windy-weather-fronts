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

/** Resolve a mirrored-media URL: the Vercel/Blob backend returns absolute
 * CDN URLs, the local/fs backend relative /charts/... paths. */
export function resolveMediaUrl(url: string): string {
    return /^https?:\/\//.test(url) ? url : `${BACKEND_URL}${url}`;
}

export function chartUrl(chart: StoredChart): string {
    return resolveMediaUrl(chart.url);
}

export async function fetchChartSources(): Promise<ChartSourceIndex[]> {
    const res = await fetch(`${BACKEND_URL}/api/charts`);
    if (!res.ok) throw new Error(`Backend error: HTTP ${res.status}`);
    return res.json();
}

// --- KNMI extraction process (website demo page) ---------------------------

export interface PixelFront {
    type: 'cold' | 'warm' | 'occluded' | 'stationary' | string;
    points: [number, number][];
    derived?: boolean;
}

export interface PixelCenter {
    centerType: 'high' | 'low';
    x: number;
    y: number;
}

export interface GeoFrontFeature {
    type: 'Feature';
    geometry:
        | { type: 'LineString'; coordinates: [number, number][] }
        | { type: 'Point'; coordinates: [number, number] };
    properties: {
        kind: 'front' | 'pressure-center';
        frontType?: string;
        centerType?: 'high' | 'low';
    };
}

export interface KnmiProcess {
    chart: {
        url: string;
        label: string;
        validTime: string | null;
        originUrl: string;
        width: number;
        height: number;
        fetchedAt: string | null;
    };
    projection: {
        poleX: number;
        poleY: number;
        scale: number;
        lon0: number;
        width: number;
        height: number;
    };
    pixelFronts: PixelFront[];
    pixelCenters: PixelCenter[];
    geojson: { type: 'FeatureCollection'; features: GeoFrontFeature[] };
}

export async function fetchKnmiProcess(): Promise<KnmiProcess> {
    const res = await fetch(`${BACKEND_URL}/api/knmi/process`);
    if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `Backend error: HTTP ${res.status}`);
    }
    return res.json();
}
