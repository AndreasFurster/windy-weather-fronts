/**
 * Framework-agnostic API handler logic shared between the Vercel serverless
 * functions (api/*.ts) and the local Express server (src/index.ts).
 *
 * Each function returns { status, body } — the caller is responsible for
 * sending the HTTP response. This keeps all routing/response concerns in the
 * framework layer and all business logic here.
 */

import type { IDataStore } from './dataStore.js';
import type { FrontsSource } from './types.js';
import type { ChartSource } from './charts/types.js';

type HandlerResult = { status: number; body: unknown };

// ---------------------------------------------------------------------------
// GET /api/sources
// ---------------------------------------------------------------------------
export async function handleGetSources(
    store: IDataStore,
    sources: FrontsSource[],
): Promise<HandlerResult> {
    const body = await Promise.all(sources.map(async s => {
        const dataset = await store.getFronts(s.info.id);
        return {
            ...s.info,
            available: Boolean(dataset && dataset.timesteps.length),
            issuedTime: dataset?.issuedTime ?? null,
            fetchedAt: dataset?.fetchedAt ?? null,
            times: dataset?.timesteps.map(t => ({
                validTime: t.validTime,
                forecastHours: t.forecastHours,
            })) ?? [],
        };
    }));
    return { status: 200, body };
}

// ---------------------------------------------------------------------------
// GET /api/fronts/:sourceId
// ---------------------------------------------------------------------------
export async function handleGetFronts(
    store: IDataStore,
    sources: FrontsSource[],
    sourceId: string,
): Promise<HandlerResult> {
    const source = sources.find(s => s.info.id === sourceId);
    if (!source) {
        return { status: 404, body: { error: `unknown source '${sourceId}'` } };
    }
    const dataset = await store.getFronts(sourceId);
    if (!dataset) {
        return { status: 503, body: { error: 'no data collected yet, try again shortly' } };
    }
    return { status: 200, body: { ...source.info, ...dataset } };
}

// ---------------------------------------------------------------------------
// GET /api/charts
// ---------------------------------------------------------------------------
export async function handleGetCharts(store: IDataStore): Promise<HandlerResult> {
    const body = await store.listChartsMeta();
    return { status: 200, body };
}

// ---------------------------------------------------------------------------
// POST /api/refresh/fronts/:sourceId
// ---------------------------------------------------------------------------
export async function handleRefreshFronts(
    store: IDataStore,
    sources: FrontsSource[],
    sourceId: string,
): Promise<HandlerResult> {
    const source = sources.find(s => s.info.id === sourceId);
    if (!source) {
        return { status: 404, body: { error: `unknown source '${sourceId}'` } };
    }

    const started = Date.now();
    try {
        const result = await source.fetch();
        const dataset = {
            sourceId,
            fetchedAt: new Date().toISOString(),
            ...result,
        };
        await store.putFronts(dataset);
        const nFeatures = result.timesteps.reduce((n, t) => n + t.geojson.features.length, 0);
        console.log(
            `[${sourceId}] refreshed in ${Date.now() - started}ms: `
            + `${result.timesteps.length} timesteps, ${nFeatures} features`,
        );
        return {
            status: 200,
            body: {
                ok: true,
                sourceId,
                durationMs: Date.now() - started,
                timesteps: result.timesteps.length,
                features: nFeatures,
            },
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[${sourceId}] refresh failed:`, message);
        return { status: 502, body: { ok: false, sourceId, error: message } };
    }
}

// ---------------------------------------------------------------------------
// POST /api/refresh/charts/:sourceId
// ---------------------------------------------------------------------------
export async function handleRefreshCharts(
    store: IDataStore,
    chartSources: ChartSource[],
    sourceId: string,
): Promise<HandlerResult> {
    const source = chartSources.find(s => s.id === sourceId);
    if (!source) {
        return { status: 404, body: { error: `unknown chart source '${sourceId}'` } };
    }

    const started = Date.now();
    const previous = await store.getChartsMeta(sourceId);
    const updated = await store.refreshAndStoreChartImages(source, previous);
    await store.putChartsMeta(sourceId, updated);

    return {
        status: updated.available ? 200 : 502,
        body: {
            ok: updated.available,
            sourceId,
            durationMs: Date.now() - started,
            charts: updated.charts.length,
            error: updated.error,
        },
    };
}

// ---------------------------------------------------------------------------
// POST /api/refresh  (refresh all sources)
// ---------------------------------------------------------------------------
export interface RefreshAllResult {
    type: 'fronts' | 'charts';
    sourceId: string;
    status: number;
    body: unknown;
}

export async function handleRefreshAll(
    store: IDataStore,
    frontsSources: FrontsSource[],
    chartSources: ChartSource[],
    onResult?: (r: RefreshAllResult) => void,
): Promise<RefreshAllResult[]> {
    const results: RefreshAllResult[] = [];

    for (const source of frontsSources) {
        const { status, body } = await handleRefreshFronts(store, frontsSources, source.info.id);
        const r: RefreshAllResult = { type: 'fronts', sourceId: source.info.id, status, body };
        results.push(r);
        onResult?.(r);
    }

    for (const source of chartSources) {
        const { status, body } = await handleRefreshCharts(store, chartSources, source.id);
        const r: RefreshAllResult = { type: 'charts', sourceId: source.id, status, body };
        results.push(r);
        onResult?.(r);
    }

    return results;
}

// ---------------------------------------------------------------------------
// Auth helper — framework-independent token check
// ---------------------------------------------------------------------------
export function isRefreshTokenValid(headerValue: string | string[] | undefined): boolean {
    const expected = process.env.REFRESH_TOKEN;
    if (!expected) return true; // token not configured → open
    const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    return value === expected;
}
