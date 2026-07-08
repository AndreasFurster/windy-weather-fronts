/**
 * Met Office (UKMO) surface analysis in IAC FLEET code (FM 46), distributed
 * via NOAA as ASXX21 EGRR (analysis) and FSXX21 EGRR (forecast, when
 * available). Covers the North Atlantic and Europe.
 *
 * Relevant parts of the FM 46 code:
 *  - Sections are introduced by `999xx` groups: 99900 pressure systems,
 *    99911 fronts, 99922 isobars, 99933 tropical, 99944 area/misc.
 *  - Pressure systems: `8PtPcPP` + position (Pt: 1 = low, 5 = high, PP =
 *    pressure minus 900/1000). `83///` introduces a trough line followed by
 *    position groups.
 *  - Fronts: `66FtFiFc` + positions (Ft: 0/1 stationary, 2/3 warm, 4/5 cold,
 *    6 occlusion, 7 instability line, 8 intertropical, 9 convergence line).
 *  - Positions are 5 digit `LaLaLoLok` groups: latitude and longitude in
 *    whole degrees; k selects hemisphere/half-degrees (0-4 east, 5-9 west;
 *    1/6 add 0.5 lat, 2/7 add 0.5 lon, 3/8 add both, 4/9 add 100 to lon).
 */

import type {
    FeatureCollection,
    FrontsFeature,
    FrontsSource,
    FrontsTimestep,
    FrontType,
} from '../types.ts';

const ANALYSIS_URL = 'https://tgftp.nws.noaa.gov/data/raw/as/asxx21.egrr..txt';

const FRONT_TYPES: Record<number, FrontType> = {
    0: 'stationary',
    1: 'stationary',
    2: 'warm',
    3: 'warm',
    4: 'cold',
    5: 'cold',
    6: 'occluded',
    7: 'instability',
    8: 'intertropical',
    9: 'convergence',
};

/** Decode an IAC FLEET `LaLaLoLok` position group. */
function decodePos(group: string): [number, number] | null {
    if (!/^\d{5}$/.test(group)) return null;
    let lat = parseInt(group.slice(0, 2), 10);
    let lon = parseInt(group.slice(2, 4), 10);
    const k = parseInt(group[4], 10);

    switch (k % 5) {
        case 1: lat += 0.5; break;
        case 2: lon += 0.5; break;
        case 3: lat += 0.5; lon += 0.5; break;
        case 4: lon += 100; break;
    }
    if (k >= 5) lon = -lon;

    if (lat < 20 || lat > 85) return null; // outside the EGRR chart domain
    return [lat, lon];
}

function parseBulletin(text: string): FeatureCollection {
    const features: FrontsFeature[] = [];

    // Everything in the body is 5-character groups; flatten to a token
    // stream. Continuation lines simply continue the current feature.
    const body = text.split(/\r?\n/).slice(1).join(' ');
    const tokens = body.split(/\s+/).filter(t => /^[\d/]{5}$/.test(t));

    let section = '';
    let i = 0;

    const collectPositions = (): [number, number][] => {
        const pts: [number, number][] = [];
        while (i < tokens.length) {
            const t = tokens[i];
            // Stop at the next feature/section introducer.
            if (t.startsWith('999') || t.startsWith('66') || /^8[135]/.test(t) || t.startsWith('83/')) break;
            const p = decodePos(t);
            if (p) pts.push(p);
            i++;
        }
        return pts;
    };

    while (i < tokens.length) {
        const tok = tokens[i];

        if (/^999\d\d$/.test(tok)) {
            section = tok.slice(3);
            i++;
            continue;
        }

        if (section === '00' && /^8[15]\d{3}$/.test(tok)) {
            // Pressure center: 8PtPcPP + position.
            const isLow = tok[1] === '1';
            const pp = parseInt(tok.slice(3), 10);
            const pressure = pp >= 50 ? 900 + pp : 1000 + pp;
            i++;
            if (i < tokens.length) {
                const pos = decodePos(tokens[i]);
                if (pos) {
                    features.push({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [pos[1], pos[0]] },
                        properties: {
                            kind: 'pressure-center',
                            centerType: isLow ? 'low' : 'high',
                            pressure,
                        },
                    });
                    i++;
                }
            }
            continue;
        }

        if (section === '00' && tok.startsWith('83')) {
            // Trough line followed by positions.
            i++;
            const pts = collectPositions();
            if (pts.length >= 2) {
                features.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: pts.map(p => [p[1], p[0]]) },
                    properties: { kind: 'front', frontType: 'trough' },
                });
            }
            continue;
        }

        if (section === '11' && /^66\d{3}$/.test(tok)) {
            const frontType = FRONT_TYPES[parseInt(tok[2], 10)];
            i++;
            const pts = collectPositions();
            if (frontType && pts.length >= 2) {
                features.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: pts.map(p => [p[1], p[0]]) },
                    properties: { kind: 'front', frontType },
                });
            }
            continue;
        }

        i++;
    }

    return { type: 'FeatureCollection', features };
}

/** Valid time from the WMO header: `ASXX21 EGRR 080600` (DDHHMM). */
function parseValidTime(text: string): Date {
    const m = text.match(/^[AF]SXX\d{2}\s+EGRR\s+(\d{2})(\d{2})(\d{2})/m);
    const now = new Date();
    if (!m) return now;
    const day = parseInt(m[1], 10);
    const hour = parseInt(m[2], 10);
    const minute = parseInt(m[3], 10);
    const candidates = [-1, 0, 1].map(off =>
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + off, day, hour, minute)));
    candidates.sort((a, b) =>
        Math.abs(a.getTime() - now.getTime()) - Math.abs(b.getTime() - now.getTime()));
    return candidates[0];
}

export const metofficeSource: FrontsSource = {
    info: {
        id: 'metoffice',
        name: 'Met Office (Europe/Atlantic)',
        region: 'Europe & North Atlantic',
        attribution: 'Met Office analysis via NOAA (IAC FLEET, ASXX21 EGRR)',
        bounds: [-45, 33, 35, 72],
        method: 'coded-bulletin',
        refreshMinutes: 60,
    },

    async fetch() {
        const res = await fetch(ANALYSIS_URL, { headers: { 'user-agent': 'windy-weather-fronts' } });
        if (!res.ok) throw new Error(`Met Office fetch failed: HTTP ${res.status}`);
        const text = await res.text();

        const validTime = parseValidTime(text);
        const geojson = parseBulletin(text);
        if (geojson.features.length === 0) {
            throw new Error('Met Office bulletin parsed to zero features');
        }

        const timesteps: FrontsTimestep[] = [{
            validTime: validTime.toISOString(),
            forecastHours: 0,
            geojson,
        }];
        return { issuedTime: validTime.toISOString(), timesteps };
    },
};
