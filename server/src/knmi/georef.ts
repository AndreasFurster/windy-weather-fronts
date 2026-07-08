/**
 * Georeferencing of the KNMI surface analysis/forecast charts.
 *
 * The charts are drawn in a north polar stereographic projection: meridians
 * are straight lines radiating from the (off-image) pole, parallels are
 * concentric circles around it. Pixel <-> lat/lon therefore only needs four
 * parameters:
 *
 *   poleX, poleY  pixel position of the north pole
 *   scale         pixels per unit of tan((90 - lat) / 2)
 *   lon0          longitude of the meridian pointing straight down (+y)
 *
 * The parameters below were fitted with `npm run calibrate` (see
 * server/tools/calibrate.ts), which extracts the gray graticule pixels from a
 * live chart and least-squares fits them against the 10-degree grid. Rerun it
 * if KNMI ever changes the chart layout, and paste the new values here.
 */

export interface StereoParams {
    poleX: number;
    poleY: number;
    scale: number;
    lon0: number;
    width: number;
    height: number;
}

export const KNMI_CHART_PARAMS: StereoParams = {
    // Fitted 2026-07-08 against AL0806_large.gif (1083 x 696); median
    // graticule residual 0.25px. The graticule fit only pins lon0 modulo the
    // 10-degree grid spacing; the absolute meridian (lon0 ~ 0) was verified
    // against coastline landmarks.
    poleX: 562.76,
    poleY: -325.14,
    scale: 1841.16,
    lon0: -0.002,
    width: 1083,
    height: 696,
};

const DEG = Math.PI / 180;

/** Pixel -> [lat, lon] in degrees. */
export function pxToLatLon(x: number, y: number, p: StereoParams): [number, number] {
    const dx = x - p.poleX;
    const dy = y - p.poleY;
    const rho = Math.hypot(dx, dy);
    const lat = 90 - 2 * Math.atan(rho / p.scale) / DEG;
    const lon = p.lon0 + Math.atan2(dx, dy) / DEG;
    return [round4(lat), round4(normLon(lon))];
}

/** [lat, lon] -> pixel, used by the calibration/preview tooling. */
export function latLonToPx(lat: number, lon: number, p: StereoParams): [number, number] {
    const rho = p.scale * Math.tan((90 - lat) / 2 * DEG);
    const theta = (lon - p.lon0) * DEG;
    return [p.poleX + rho * Math.sin(theta), p.poleY + rho * Math.cos(theta)];
}

function normLon(lon: number): number {
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return lon;
}

function round4(v: number): number {
    return Math.round(v * 1e4) / 1e4;
}
