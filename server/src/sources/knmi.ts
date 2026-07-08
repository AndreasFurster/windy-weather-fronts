/**
 * KNMI — Dutch national weather service surface charts.
 *
 * KNMI does not publish the front geometry as data, only as chart images
 * (analysis `ALddhh` + forecasts `PLddhh`, dd = day of month, hh = UTC hour).
 * The front lines are therefore vectorized from the GIF images: exact palette
 * color masking, thinning and tracing, then mapped to lat/lon through the
 * calibrated polar stereographic projection of the chart. See
 * `../knmi/extract.ts` and `../knmi/georef.ts`.
 */

import type { FrontsSource, FrontsTimestep } from '../types.ts';
import { decodeGif } from '../knmi/gif.ts';
import { extractFronts } from '../knmi/extract.ts';
import { KNMI_CHART_PARAMS } from '../knmi/georef.ts';

export const KNMI_PAGE_URL = 'https://www.knmi.nl/nederland-nu/weer/waarschuwingen-en-verwachtingen/weerkaarten';
const PAGE_URL = KNMI_PAGE_URL;
const IMAGE_RE = /https:\/\/cdn\.knmi\.nl\/[^"'\s]*weerkaarten\/(AL|PL)(\d{2})(\d{2})_large\.gif/g;

export interface ChartRef {
    url: string;
    kind: 'analysis' | 'forecast';
    validTime: Date;
}

export function findKnmiCharts(html: string, now: Date): ChartRef[] {
    const seen = new Set<string>();
    const charts: ChartRef[] = [];

    for (const m of html.matchAll(IMAGE_RE)) {
        const [url, kind, dd, hh] = [m[0], m[1], m[2], m[3]];
        if (seen.has(url)) continue;
        seen.add(url);
        charts.push({
            url,
            kind: kind === 'AL' ? 'analysis' : 'forecast',
            validTime: resolveDay(now, parseInt(dd, 10), parseInt(hh, 10)),
        });
    }
    charts.sort((a, b) => a.validTime.getTime() - b.validTime.getTime());
    return charts;
}

/** Filenames only carry day-of-month + hour; pick the date closest to now. */
function resolveDay(now: Date, day: number, hour: number): Date {
    const candidates = [-1, 0, 1].map(off =>
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + off, day, hour)));
    candidates.sort((a, b) =>
        Math.abs(a.getTime() - now.getTime()) - Math.abs(b.getTime() - now.getTime()));
    return candidates[0];
}

export const knmiSource: FrontsSource = {
    info: {
        id: 'knmi',
        name: 'KNMI (Europe)',
        region: 'Europe & North-East Atlantic',
        attribution: 'KNMI weerkaarten (fronts vectorized from chart images; approximate)',
        bounds: [-40, 30, 30, 65],
        method: 'image-extraction',
        refreshMinutes: 60,
    },

    async fetch() {
        const now = new Date();
        const pageRes = await fetch(PAGE_URL, { headers: { 'user-agent': 'windy-weather-fronts' } });
        if (!pageRes.ok) throw new Error(`KNMI page fetch failed: HTTP ${pageRes.status}`);
        const charts = findKnmiCharts(await pageRes.text(), now);
        if (!charts.length) throw new Error('KNMI page contained no chart images');

        const analysis = charts.find(c => c.kind === 'analysis');
        const timesteps: FrontsTimestep[] = [];

        for (const chart of charts) {
            const res = await fetch(chart.url, { headers: { 'user-agent': 'windy-weather-fronts' } });
            if (!res.ok) {
                console.warn(`[knmi] chart fetch failed (${chart.url}): HTTP ${res.status}`);
                continue;
            }
            const img = decodeGif(new Uint8Array(await res.arrayBuffer()));
            if (img.width !== KNMI_CHART_PARAMS.width || img.height !== KNMI_CHART_PARAMS.height) {
                console.warn(
                    `[knmi] chart layout changed (${img.width}x${img.height}), ` +
                    'georeferencing needs recalibration - skipping');
                continue;
            }

            const features = extractFronts(img);
            const refTime = analysis?.validTime ?? now;
            timesteps.push({
                validTime: chart.validTime.toISOString(),
                forecastHours: chart.kind === 'analysis'
                    ? 0
                    : Math.round((chart.validTime.getTime() - refTime.getTime()) / 3_600_000),
                geojson: { type: 'FeatureCollection', features },
            });
        }

        if (!timesteps.length) throw new Error('KNMI refresh produced no usable charts');
        return {
            issuedTime: analysis?.validTime.toISOString(),
            timesteps,
        };
    },
};
