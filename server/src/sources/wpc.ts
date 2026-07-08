/**
 * NOAA/NWS Weather Prediction Center — coded surface frontal positions.
 *
 * Two text products, both fully machine readable:
 *  - CODSUS (ASUS02 KWBC): surface analysis. Positions are 7 digit groups,
 *    `LLLNNNN` = latitude in tenths (3 digits) + longitude in tenths (4
 *    digits, degrees west).
 *  - CODSRP (FSUS02 KWBC): 12/24/36/48h forecast fronts. Positions are 4 or 5
 *    digit groups, `LLNN(N)` = latitude in whole degrees (2 digits) +
 *    longitude in whole degrees west (2-3 digits).
 *
 * Docs: https://www.wpc.ncep.noaa.gov/html/codsus.shtml
 */

import type {
    FeatureCollection,
    FrontsFeature,
    FrontsSource,
    FrontsTimestep,
    FrontType,
} from '../types.ts';

const ANALYSIS_URL = 'https://tgftp.nws.noaa.gov/data/raw/as/asus02.kwbc.cod.sus.txt';
const FORECAST_URL = 'https://tgftp.nws.noaa.gov/data/raw/fs/fsus02.kwbc.cod.srp.txt';

const FRONT_KEYWORDS: Record<string, FrontType> = {
    COLD: 'cold',
    WARM: 'warm',
    STNRY: 'stationary',
    OCFNT: 'occluded',
    TROF: 'trough',
};

const STRENGTH_KEYWORDS = new Set(['WK', 'MDT', 'STG']);

/** Decode an analysis position group, e.g. `4090667` -> [40.9, -66.7]. */
function decodeAnalysisPos(group: string): [number, number] | null {
    if (!/^\d{7}$/.test(group)) return null;
    const lat = parseInt(group.slice(0, 3), 10) / 10;
    let lon = parseInt(group.slice(3), 10) / 10;
    // Longitudes are degrees west; values beyond 180 wrap into the eastern
    // hemisphere (Aleutians across the date line).
    lon = lon > 180 ? 360 - lon : -lon;
    if (lat < 0 || lat > 90) return null;
    return [lat, lon];
}

/** Decode a forecast position group, e.g. `44110` -> [44, -110]. */
function decodeForecastPos(group: string): [number, number] | null {
    if (!/^\d{4,5}$/.test(group)) return null;
    const lat = parseInt(group.slice(0, 2), 10);
    let lon = parseInt(group.slice(2), 10);
    lon = lon > 180 ? 360 - lon : -lon;
    if (lat < 15 || lat > 90) return null;
    return [lat, lon];
}

interface Block {
    validTime: Date;
    forecastHours: number;
    tokens: string[];
}

/**
 * Split a bulletin into VALID-time blocks. Feature data lines wrap freely, so
 * each block is handled as a flat token stream where keywords (HIGHS, COLD,
 * ...) start a new feature and numeric groups are its data.
 */
function splitBlocks(text: string, issued: Date): Block[] {
    const blocks: Block[] = [];
    const lines = text.split(/\r?\n/);
    let current: Block | null = null;

    for (const line of lines) {
        const analysisMatch = line.match(/^VALID\s+(\d{2})(\d{2})(\d{2})Z/);
        const progMatch = line.match(/^(\d{1,3})HR\s+PROG\s+VALID\s+(\d{2})(\d{2})(\d{2})Z/);

        if (progMatch) {
            const [, hours, dd, hh, mm] = progMatch;
            current = {
                validTime: resolveDay(issued, parseInt(dd, 10), parseInt(hh, 10), parseInt(mm, 10)),
                forecastHours: parseInt(hours, 10),
                tokens: [],
            };
            blocks.push(current);
        } else if (analysisMatch) {
            // Analysis valid time is MMDDHH.
            const [, mo, dd, hh] = analysisMatch;
            current = {
                validTime: resolveMonthDay(issued, parseInt(mo, 10), parseInt(dd, 10), parseInt(hh, 10)),
                forecastHours: 0,
                tokens: [],
            };
            blocks.push(current);
        } else if (current) {
            current.tokens.push(...line.trim().split(/\s+/).filter(Boolean));
        }
    }
    return blocks;
}

/** Resolve a day-of-month near the issue date (handles month rollover). */
function resolveDay(issued: Date, day: number, hour: number, minute: number): Date {
    const candidates = [-1, 0, 1].map(monthOffset => {
        const d = new Date(Date.UTC(
            issued.getUTCFullYear(), issued.getUTCMonth() + monthOffset, day, hour, minute,
        ));
        return d;
    });
    candidates.sort((a, b) =>
        Math.abs(a.getTime() - issued.getTime()) - Math.abs(b.getTime() - issued.getTime()));
    return candidates[0];
}

function resolveMonthDay(issued: Date, month: number, day: number, hour: number): Date {
    const years = [issued.getUTCFullYear() - 1, issued.getUTCFullYear(), issued.getUTCFullYear() + 1];
    const candidates = years.map(y => new Date(Date.UTC(y, month - 1, day, hour)));
    candidates.sort((a, b) =>
        Math.abs(a.getTime() - issued.getTime()) - Math.abs(b.getTime() - issued.getTime()));
    return candidates[0];
}

function parseBlock(block: Block, decodePos: (g: string) => [number, number] | null): FeatureCollection {
    const features: FrontsFeature[] = [];
    const tokens = block.tokens;
    let i = 0;

    while (i < tokens.length) {
        const tok = tokens[i];

        if (tok === 'HIGHS' || tok === 'LOWS') {
            const centerType = tok === 'HIGHS' ? 'high' : 'low';
            i++;
            while (i + 1 < tokens.length && /^\d{3,4}$/.test(tokens[i]) && decodePos(tokens[i + 1])) {
                const pressure = parseInt(tokens[i], 10);
                const pos = decodePos(tokens[i + 1])!;
                features.push({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [pos[1], pos[0]] },
                    properties: { kind: 'pressure-center', centerType, pressure },
                });
                i += 2;
            }
        } else if (FRONT_KEYWORDS[tok]) {
            const frontType = FRONT_KEYWORDS[tok];
            i++;
            let strength: string | undefined;
            if (i < tokens.length && STRENGTH_KEYWORDS.has(tokens[i])) {
                strength = tokens[i];
                i++;
            }
            const coordinates: [number, number][] = [];
            while (i < tokens.length && decodePos(tokens[i])) {
                const [lat, lon] = decodePos(tokens[i])!;
                coordinates.push([lon, lat]);
                i++;
            }
            if (coordinates.length >= 2) {
                features.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates },
                    properties: { kind: 'front', frontType, ...(strength ? { strength } : {}) },
                });
            }
        } else {
            i++;
        }
    }

    return { type: 'FeatureCollection', features };
}

/** Issue time from the WMO header, e.g. `ASUS02 KWBC 080900` (DDHHMM). */
function parseIssued(text: string): Date {
    const m = text.match(/^[AF]SUS\d{2}\s+KWBC\s+(\d{2})(\d{2})(\d{2})/m);
    const now = new Date();
    if (!m) return now;
    return resolveDay(now, parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
}

async function fetchText(url: string): Promise<string> {
    const res = await fetch(url, { headers: { 'user-agent': 'windy-weather-fronts' } });
    if (!res.ok) throw new Error(`WPC fetch failed: ${url} -> HTTP ${res.status}`);
    return res.text();
}

export const wpcSource: FrontsSource = {
    info: {
        id: 'wpc',
        name: 'NOAA WPC (North America)',
        region: 'North America',
        attribution: 'NOAA/NWS Weather Prediction Center',
        bounds: [-130, 20, -60, 55],
        method: 'coded-bulletin',
        refreshMinutes: 60,
    },

    async fetch() {
        const timesteps: FrontsTimestep[] = [];
        let issuedTime: string | undefined;

        const analysisText = await fetchText(ANALYSIS_URL);
        const analysisIssued = parseIssued(analysisText);
        issuedTime = analysisIssued.toISOString();
        for (const block of splitBlocks(analysisText, analysisIssued)) {
            timesteps.push({
                validTime: block.validTime.toISOString(),
                forecastHours: 0,
                geojson: parseBlock(block, decodeAnalysisPos),
            });
        }

        // The forecast product is optional: if it fails we still return the
        // analysis rather than failing the whole refresh.
        try {
            const forecastText = await fetchText(FORECAST_URL);
            const forecastIssued = parseIssued(forecastText);
            for (const block of splitBlocks(forecastText, forecastIssued)) {
                if (block.forecastHours === 0) continue;
                timesteps.push({
                    validTime: block.validTime.toISOString(),
                    forecastHours: block.forecastHours,
                    geojson: parseBlock(block, decodeForecastPos),
                });
            }
        } catch (err) {
            console.warn('[wpc] forecast product unavailable:', err);
        }

        timesteps.sort((a, b) => a.validTime.localeCompare(b.validTime));
        return { issuedTime, timesteps };
    },
};
