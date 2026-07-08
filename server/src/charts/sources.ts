/**
 * Chart image sources: each adapter scrapes the public page of a national
 * weather service and returns the current front/surface-pressure chart image
 * URLs. The collector then mirrors them locally (see collector.ts) — the
 * website never hotlinks the origin.
 */

import type { ChartImage, ChartSource } from './types.ts';
import { findKnmiCharts, KNMI_PAGE_URL } from '../sources/knmi.ts';

const UA = { 'user-agent': 'windy-weather-fronts (chart mirror)' };

async function fetchPage(url: string): Promise<string> {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`page fetch failed: ${url} -> HTTP ${res.status}`);
    return res.text();
}

function hoursLabel(forecastHours: number): string {
    return forecastHours === 0 ? 'Analysis' : `+${forecastHours} h`;
}

/** KNMI surface charts (analysis + forecasts). */
const knmi: ChartSource = {
    id: 'knmi',
    name: 'KNMI',
    region: 'Europe / NE Atlantic',
    attribution: 'KNMI (Koninklijk Nederlands Meteorologisch Instituut)',
    pageUrl: KNMI_PAGE_URL,
    refreshMinutes: 60,

    async list() {
        const now = new Date();
        const charts = findKnmiCharts(await fetchPage(KNMI_PAGE_URL), now);
        const analysis = charts.find(c => c.kind === 'analysis');
        const ref = analysis?.validTime ?? now;
        return charts.map(c => {
            const forecastHours = c.kind === 'analysis'
                ? 0
                : Math.round((c.validTime.getTime() - ref.getTime()) / 3_600_000);
            return {
                url: c.url,
                label: hoursLabel(forecastHours),
                validTime: c.validTime.toISOString(),
                forecastHours,
            };
        });
    },
};

/** DWD hobby-meteorologist surface pressure chart (analysis). */
const dwd: ChartSource = {
    id: 'dwd',
    name: 'DWD',
    region: 'Europe / North Atlantic',
    attribution: 'Deutscher Wetterdienst',
    pageUrl: 'https://www.dwd.de/EN/ourservices/hobbymet_wcharts_europe/hobbyeuropecharts.html',
    refreshMinutes: 60,

    async list() {
        const html = await fetchPage(this.pageUrl);
        const re = /https:\/\/www\.dwd\.de\/DWD\/wetter\/wv_spez\/hobbymet\/wetterkarten\/[^"'\s]+\.(?:png|gif)/g;
        const urls = [...new Set(html.match(re) ?? [])];
        if (!urls.length) throw new Error('no chart images found on DWD page');
        return urls.map(url => ({
            url,
            label: /_ana\./.test(url) ? 'Analysis' : url.split('/').pop() ?? 'Chart',
        }));
    },
};

/** Met Office colour surface pressure charts (T+0 ... T+84). */
const metofficeCharts: ChartSource = {
    id: 'metoffice',
    name: 'Met Office',
    region: 'Europe / North Atlantic',
    attribution: 'Met Office (UK)',
    pageUrl: 'https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure',
    refreshMinutes: 60,

    async list() {
        const html = await fetchPage(this.pageUrl);
        const re = /https:\/\/data\.consumer-digital\.api\.metoffice\.gov\.uk\/v1\/surface-pressure\/colour\/(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})\/FSXX00T_(\d{2})\.gif/g;
        const images: ChartImage[] = [];
        const seen = new Set<string>();

        for (const m of html.matchAll(re)) {
            if (seen.has(m[0])) continue;
            seen.add(m[0]);
            const base = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
            const forecastHours = parseInt(m[6], 10);
            images.push({
                url: m[0],
                label: hoursLabel(forecastHours),
                validTime: new Date(base + forecastHours * 3_600_000).toISOString(),
                forecastHours,
            });
        }
        if (!images.length) throw new Error('no colour charts found on Met Office page');
        images.sort((a, b) => (a.forecastHours ?? 0) - (b.forecastHours ?? 0));
        return images;
    },
};

/** AEMET fronts maps (analysis + forecasts). */
const aemet: ChartSource = {
    id: 'aemet',
    name: 'AEMET',
    region: 'Europe / Iberia',
    attribution: 'AEMET (Agencia Estatal de Meteorología, Spain)',
    pageUrl: 'https://www.aemet.es/en/eltiempo/prediccion/mapa_frentes',
    refreshMinutes: 60,

    async list() {
        const html = await fetchPage(this.pageUrl);
        const re = /\/imagenes_d\/eltiempo\/prediccion\/mapa_frentes\/(\d{4})(\d{2})(\d{2})(\d{2})\+(\d{3})_ww_[^"'\s]+\.gif/g;
        const images: ChartImage[] = [];
        const seen = new Set<string>();

        for (const m of html.matchAll(re)) {
            const url = `https://www.aemet.es${m[0]}`;
            if (seen.has(url)) continue;
            seen.add(url);
            const base = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]);
            const forecastHours = parseInt(m[5], 10);
            images.push({
                url,
                label: hoursLabel(forecastHours),
                validTime: new Date(base + forecastHours * 3_600_000).toISOString(),
                forecastHours,
            });
        }
        if (!images.length) throw new Error('no fronts maps found on AEMET page');
        images.sort((a, b) =>
            (a.validTime ?? '').localeCompare(b.validTime ?? ''));
        return images;
    },
};

/** wetterpate.de / FU Berlin surface analysis charts. */
const wetterpate: ChartSource = {
    id: 'wetterpate',
    name: 'Wetterpate (FU Berlin)',
    region: 'Europe / North Atlantic',
    attribution: 'Institut für Meteorologie, FU Berlin — wetterpate.de',
    pageUrl: 'https://www.wetterpate.de/',
    refreshMinutes: 60,

    async list() {
        const html = await fetchPage(this.pageUrl);
        const re = /https:\/\/www\.met\.fu-berlin\.de\/de\/wetter\/maps\/[a-z0-9_]+\.gif/g;
        const urls = [...new Set(html.match(re) ?? [])];
        if (!urls.length) throw new Error('no chart images found on wetterpate.de');
        const labels: Record<string, string> = {
            'anabwkna.gif': 'Surface analysis (North Atlantic/Europe)',
            'emtbkna.gif': 'Forecast chart',
        };
        return urls.map(url => {
            const file = url.split('/').pop() ?? '';
            return { url, label: labels[file] ?? file };
        });
    },
};

/**
 * Météo-France isofronts. Their chart API (rwg.meteofrance.com) requires a
 * bearer token that is not publicly derivable from the page; provide one via
 * the METEOFRANCE_TOKEN environment variable if you have it, otherwise this
 * source reports as unavailable.
 */
const meteofrance: ChartSource = {
    id: 'meteofrance',
    name: 'Météo-France',
    region: 'Europe / Near Atlantic',
    attribution: 'Météo-France',
    pageUrl: 'https://meteofrance.com/isofronts',
    refreshMinutes: 60,

    async list() {
        const token = process.env.METEOFRANCE_TOKEN;
        if (!token) {
            throw new Error('Météo-France requires an API token (set METEOFRANCE_TOKEN)');
        }
        const url = 'https://rwg.meteofrance.com/internet2018client/2.0/report'
            + '?report_type=modele&report_subtype=isofront'
            + '&domain=proche%20atlantique&resolution=large';
        const res = await fetch(url, {
            headers: { ...UA, authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Météo-France API: HTTP ${res.status}`);
        return [{ url, label: 'Isofronts (near Atlantic)' }];
    },
};

export const chartSources: ChartSource[] = [
    knmi,
    dwd,
    metofficeCharts,
    aemet,
    meteofrance,
    wetterpate,
];
