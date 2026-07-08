/**
 * Fits the polar stereographic parameters of the KNMI chart from its gray
 * 10-degree graticule, then prints the values to paste into
 * `src/knmi/georef.ts` (KNMI_CHART_PARAMS).
 *
 * Usage: node tools/calibrate.ts [path/to/chart.gif]
 * Without an argument it downloads the current analysis chart.
 */

import { readFile } from 'node:fs/promises';
import { decodeGif, type RgbaImage } from '../src/knmi/gif.js';
import { latLonToPx, type StereoParams } from '../src/knmi/georef.js';

const PAGE_URL = 'https://www.knmi.nl/nederland-nu/weer/waarschuwingen-en-verwachtingen/weerkaarten';
const GRAY: [number, number, number] = [190, 190, 190];
const DEG = Math.PI / 180;

async function loadImage(): Promise<RgbaImage> {
    const arg = process.argv[2];
    if (arg) return decodeGif(new Uint8Array(await readFile(arg)));

    const page = await (await fetch(PAGE_URL)).text();
    const m = page.match(/https:\/\/cdn\.knmi\.nl\/[^"'\s]*weerkaarten\/AL\d{4}_large\.gif/);
    if (!m) throw new Error('no analysis chart found on KNMI page');
    console.log('downloading', m[0]);
    return decodeGif(new Uint8Array(await (await fetch(m[0])).arrayBuffer()));
}

function grayPixels(img: RgbaImage): [number, number][] {
    const pts: [number, number][] = [];
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const o = (y * img.width + x) * 4;
            if (img.data[o] === GRAY[0] && img.data[o + 1] === GRAY[1] && img.data[o + 2] === GRAY[2]) {
                pts.push([x, y]);
            }
        }
    }
    return pts;
}

/**
 * Residual of one graticule pixel: distance (in px) to the nearest
 * 10-degree parallel or meridian under the given projection parameters,
 * capped for robustness against stray pixels.
 */
function residual(x: number, y: number, p: StereoParams, cap: number): number {
    const dx = x - p.poleX;
    const dy = y - p.poleY;
    const rho = Math.hypot(dx, dy);
    const lat = 90 - 2 * Math.atan(rho / p.scale) / DEG;
    const lon = p.lon0 + Math.atan2(dx, dy) / DEG;

    const latNear = Math.round(lat / 10) * 10;
    const rhoNear = p.scale * Math.tan((90 - latNear) / 2 * DEG);
    const latRes = Math.abs(rho - rhoNear);

    const lonNear = Math.round(lon / 10) * 10;
    const lonRes = rho * Math.abs(lon - lonNear) * DEG;

    return Math.min(latRes, lonRes, cap);
}

function cost(pts: [number, number][], p: StereoParams, cap: number): number {
    let sum = 0;
    for (const [x, y] of pts) sum += residual(x, y, p, cap) ** 2;
    return sum / pts.length;
}

/** Nelder-Mead over (poleX, poleY, scale, lon0). */
function nelderMead(
    f: (v: number[]) => number,
    start: number[],
    steps: number[],
    iterations: number,
): number[] {
    const n = start.length;
    let simplex = [start.slice()];
    for (let i = 0; i < n; i++) {
        const v = start.slice();
        v[i] += steps[i];
        simplex.push(v);
    }
    let values = simplex.map(f);

    for (let it = 0; it < iterations; it++) {
        const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).map(x => x[1]);
        simplex = order.map(i => simplex[i]);
        values = order.map(i => values[i]);

        const worst = simplex[n];
        const centroid = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;
        }

        const reflect = centroid.map((c, j) => c + (c - worst[j]));
        const fr = f(reflect);
        if (fr < values[0]) {
            const expand = centroid.map((c, j) => c + 2 * (c - worst[j]));
            const fe = f(expand);
            if (fe < fr) { simplex[n] = expand; values[n] = fe; }
            else { simplex[n] = reflect; values[n] = fr; }
        } else if (fr < values[n - 1]) {
            simplex[n] = reflect; values[n] = fr;
        } else {
            const contract = centroid.map((c, j) => c + 0.5 * (worst[j] - c));
            const fc = f(contract);
            if (fc < values[n]) { simplex[n] = contract; values[n] = fc; }
            else {
                for (let i = 1; i <= n; i++) {
                    simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
                    values[i] = f(simplex[i]);
                }
            }
        }
    }
    return simplex[values.indexOf(Math.min(...values))];
}

const img = await loadImage();
console.log(`chart size: ${img.width} x ${img.height}`);
const pts = grayPixels(img).filter((_, i) => i % 2 === 0);
console.log(`graticule pixels used: ${pts.length}`);

// Rough manual estimate from the 30/40/50N labels on the right edge of the
// chart; the optimizer refines it.
let params: StereoParams = {
    poleX: 550, poleY: -256, scale: 1747, lon0: 5,
    width: img.width, height: img.height,
};

// Coarse-to-fine: shrink the robustness cap as the fit improves.
for (const cap of [40, 15, 6, 3]) {
    const vec = nelderMead(
        v => cost(pts, { ...params, poleX: v[0], poleY: v[1], scale: v[2], lon0: v[3] }, cap),
        [params.poleX, params.poleY, params.scale, params.lon0],
        [30, 80, 100, 2],
        400,
    );
    params = { ...params, poleX: vec[0], poleY: vec[1], scale: vec[2], lon0: vec[3] };
    console.log(`cap ${cap}px -> cost ${cost(pts, params, cap).toFixed(3)}  ` +
        `pole (${params.poleX.toFixed(1)}, ${params.poleY.toFixed(1)}) ` +
        `scale ${params.scale.toFixed(1)} lon0 ${params.lon0.toFixed(2)}`);
}

// Residual stats at the end (uncapped, but clipped at 20px for readability).
const finals = pts.map(([x, y]) => residual(x, y, params, 20)).sort((a, b) => a - b);
console.log(`median residual: ${finals[Math.floor(finals.length / 2)].toFixed(2)}px, ` +
    `p90: ${finals[Math.floor(finals.length * 0.9)].toFixed(2)}px`);

console.log('\nPaste into src/knmi/georef.ts:');
console.log(JSON.stringify({
    poleX: +params.poleX.toFixed(2),
    poleY: +params.poleY.toFixed(2),
    scale: +params.scale.toFixed(2),
    lon0: +params.lon0.toFixed(3),
    width: img.width,
    height: img.height,
}, null, 4));

// Landmarks for a visual sanity check of the fit.
const landmarks: [string, number, number][] = [
    ['Gibraltar', 36.14, -5.35],
    ['Land\'s End (UK)', 50.07, -5.71],
    ['Skagen (DK)', 57.73, 10.59],
    ['Cape Finisterre (ES)', 42.88, -9.27],
    ['Reykjavik (IS)', 64.15, -21.94],
    ['Den Helder (NL)', 52.96, 4.76],
];
console.log('\nLandmark pixel positions (check against the chart):');
for (const [name, lat, lon] of landmarks) {
    const [x, y] = latLonToPx(lat, lon, params);
    console.log(`  ${name}: (${x.toFixed(0)}, ${y.toFixed(0)})`);
}
