/**
 * Runs the KNMI front extraction on a chart image and writes the traced
 * pixel paths as JSON, for overlaying on the source image when debugging.
 *
 * Usage: node tools/extract-preview.ts <chart.gif> <out.json>
 */

import { readFile, writeFile } from 'node:fs/promises';
import { decodeGif } from '../src/knmi/gif.js';
import { extractPixelChart } from '../src/knmi/extract.js';
import { pxToLatLon, KNMI_CHART_PARAMS } from '../src/knmi/georef.js';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
    console.error('usage: node tools/extract-preview.ts <chart.gif> <out.json>');
    process.exit(1);
}

const img = decodeGif(new Uint8Array(await readFile(inPath)));
const { fronts, centers } = extractPixelChart(img);

for (const f of fronts) {
    const [x0, y0] = f.points[0];
    const [lat, lon] = pxToLatLon(x0, y0, KNMI_CHART_PARAMS);
    console.log(
        `${f.type}${f.derived ? ' (derived)' : ''}: ${f.points.length} vertices, ` +
        `starts at ${lat.toFixed(1)}N ${lon.toFixed(1)}E`);
}
for (const c of centers) {
    const [lat, lon] = pxToLatLon(c.x, c.y, KNMI_CHART_PARAMS);
    console.log(`${c.centerType.toUpperCase()} center at ${lat.toFixed(1)}N ${lon.toFixed(1)}E (px ${c.x}, ${c.y})`);
}

await writeFile(outPath, JSON.stringify({
    width: img.width,
    height: img.height,
    fronts: fronts.map(f => ({ type: f.type, derived: f.derived ?? false, points: f.points })),
    centers,
}), 'utf8');
console.log(`${fronts.length} fronts, ${centers.length} centers -> ${outPath}`);
