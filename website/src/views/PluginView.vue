<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchKnmiProcess, resolveMediaUrl, type KnmiProcess } from '../api';
import { formatTime } from '../time';

/** Where the plugin can be installed from (Windy plugin gallery). */
const INSTALL_URL = 'https://www.windy.com/plugins';
const REPO_URL = 'https://github.com/AndreasFurster/windy-weather-fronts';

// Hero screenshots, provided by hand in website/public/screenshots/ (bound
// dynamically so Vite doesn't try to resolve them at build time while the
// files don't exist yet).
const HERO_KNMI_SRC = '/screenshots/knmi-chart.png';
const HERO_WINDY_SRC = '/screenshots/windy-overlay.png';

const data = ref<KnmiProcess | null>(null);
const error = ref<string | null>(null);

const overlayCanvas = ref<HTMLCanvasElement | null>(null);
const linesCanvas = ref<HTMLCanvasElement | null>(null);
const mapContainer = ref<HTMLDivElement | null>(null);
const heroKnmiMissing = ref(false);
const heroWindyMissing = ref(false);

let map: L.Map | null = null;

const FRONT_COLORS: Record<string, string> = {
    cold: '#1e64dc',
    warm: '#d63031',
    occluded: '#9932cc',
    stationary: '#2e9e4f',
    trough: '#c47f17',
};

onMounted(async () => {
    try {
        data.value = await fetchKnmiProcess();
        await nextTick();
        drawCanvases();
        buildMap();
    } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
    }
});

onBeforeUnmount(() => {
    map?.remove();
    map = null;
});

function drawPaths(ctx: CanvasRenderingContext2D, halo: boolean): void {
    if (!data.value) return;
    for (const front of data.value.pixelFronts) {
        if (front.points.length < 2) continue;
        const trace = () => {
            ctx.beginPath();
            ctx.moveTo(front.points[0][0], front.points[0][1]);
            for (const [x, y] of front.points.slice(1)) ctx.lineTo(x, y);
            ctx.stroke();
        };
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (halo) {
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 5;
            trace();
        }
        ctx.strokeStyle = FRONT_COLORS[front.type] ?? '#666';
        ctx.lineWidth = 2.5;
        trace();
    }
}

function drawCenters(ctx: CanvasRenderingContext2D): void {
    if (!data.value) return;
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of data.value.pixelCenters) {
        ctx.fillStyle = c.centerType === 'high' ? FRONT_COLORS.cold : FRONT_COLORS.warm;
        ctx.fillText(c.centerType === 'high' ? 'H' : 'L', c.x, c.y);
    }
}

function drawCanvases(): void {
    if (!data.value) return;
    const { width, height } = data.value.chart;

    // Step 2a: traced lines over the original chart.
    const overlay = overlayCanvas.value;
    if (overlay) {
        overlay.width = width;
        overlay.height = height;
        const ctx = overlay.getContext('2d')!;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            ctx.globalAlpha = 0.45;
            ctx.drawImage(img, 0, 0, width, height);
            ctx.globalAlpha = 1;
            drawPaths(ctx, false);
        };
        img.src = resolveMediaUrl(data.value.chart.url);
    }

    // Step 2b: only the extracted lines and markers on white.
    const lines = linesCanvas.value;
    if (lines) {
        lines.width = width;
        lines.height = height;
        const ctx = lines.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        drawPaths(ctx, false);
        drawCenters(ctx);
    }
}

/** Step 3: simple unprojected lon/lat plot with a 10-degree graticule. */
const coordinatePlot = computed((): { viewBox: string; graticule: string; paths: { d: string; color: string }[]; labels: { x: number; y: number; text: string }[] } | null => {
    if (!data.value) return null;
    const lines = data.value.geojson.features.filter(f => f.geometry.type === 'LineString');
    if (!lines.length) return null;

    // ~1.6 vertical stretch approximates the map aspect at 52N.
    const Y = (lat: number) => -lat * 1.6;
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const f of lines) {
        for (const [lon, lat] of f.geometry.coordinates as [number, number][]) {
            minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
            minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
        }
    }

    const paths = lines.map(f => ({
        d: (f.geometry.coordinates as [number, number][])
            .map(([lon, lat], i) => `${i ? 'L' : 'M'}${lon.toFixed(2)},${Y(lat).toFixed(2)}`)
            .join(''),
        color: FRONT_COLORS[f.properties.frontType ?? ''] ?? '#666',
    }));

    let graticule = '';
    const labels: { x: number; y: number; text: string }[] = [];
    for (let lon = Math.ceil(minLon / 10) * 10; lon <= maxLon; lon += 10) {
        graticule += `M${lon},${Y(maxLat)}L${lon},${Y(minLat)}`;
        labels.push({ x: lon, y: Y(minLat) + 3.5, text: `${lon}°` });
    }
    for (let lat = Math.ceil(minLat / 10) * 10; lat <= maxLat; lat += 10) {
        graticule += `M${minLon},${Y(lat)}L${maxLon},${Y(lat)}`;
        labels.push({ x: minLon + 1, y: Y(lat) - 1, text: `${lat}°N` });
    }

    const pad = 3;
    const viewBox = `${(minLon - pad).toFixed(1)} ${(Y(maxLat) - pad).toFixed(1)} `
        + `${(maxLon - minLon + 2 * pad).toFixed(1)} ${(Y(minLat) - Y(maxLat) + 2 * pad + 4).toFixed(1)}`;
    return { viewBox, graticule, paths, labels };
});

function buildMap(): void {
    if (!data.value || !mapContainer.value) return;

    map = L.map(mapContainer.value, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 10,
    }).addTo(map);

    const bounds = L.latLngBounds([]);
    for (const f of data.value.geojson.features) {
        if (f.geometry.type === 'LineString') {
            const latlngs = (f.geometry.coordinates as [number, number][])
                .map(([lon, lat]) => L.latLng(lat, lon));
            L.polyline(latlngs, {
                color: FRONT_COLORS[f.properties.frontType ?? ''] ?? '#666',
                weight: 3,
                opacity: 0.9,
            }).addTo(map);
            latlngs.forEach(ll => bounds.extend(ll));
        } else {
            const [lon, lat] = f.geometry.coordinates as [number, number];
            const isHigh = f.properties.centerType === 'high';
            L.marker([lat, lon], {
                icon: L.divIcon({
                    html: `<div style="font:bold 20px Arial;color:${isHigh ? FRONT_COLORS.cold : FRONT_COLORS.warm};text-shadow:0 0 4px #000;">${isHigh ? 'H' : 'L'}</div>`,
                    className: '',
                    iconSize: [20, 22],
                    iconAnchor: [10, 11],
                }),
                interactive: false,
            }).addTo(map);
        }
    }
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16] });
}
</script>

<template>
    <main>
        <section class="hero">
            <h1>Weather fronts, extracted from the KNMI chart — live on Windy</h1>
            <p class="sub">
                KNMI publishes its surface analysis only as an image. The backend of this
                project vectorizes the fronts and pressure centers from that image every
                hour and serves them as GeoJSON, so the Windy plugin can draw them as a
                crisp, zoomable overlay.
            </p>

            <div class="hero-shots">
                <figure>
                    <img
                        v-if="!heroKnmiMissing"
                        :src="HERO_KNMI_SRC"
                        alt="KNMI surface analysis chart"
                        @error="heroKnmiMissing = true"
                    />
                    <div v-else class="shot-placeholder">
                        screenshot: KNMI front chart<br />
                        <code>website/public/screenshots/knmi-chart.png</code>
                    </div>
                    <figcaption>The KNMI surface chart…</figcaption>
                </figure>
                <figure>
                    <img
                        v-if="!heroWindyMissing"
                        :src="HERO_WINDY_SRC"
                        alt="Windy with the fronts overlay"
                        @error="heroWindyMissing = true"
                    />
                    <div v-else class="shot-placeholder">
                        screenshot: Windy with fronts overlay<br />
                        <code>website/public/screenshots/windy-overlay.png</code>
                    </div>
                    <figcaption>…as an interactive overlay on Windy.</figcaption>
                </figure>
            </div>

            <div class="cta">
                <a class="install" :href="INSTALL_URL" target="_blank" rel="noopener">Install plugin</a>
                <a class="secondary" :href="REPO_URL" target="_blank" rel="noopener">Source on GitHub</a>
            </div>
        </section>

        <section class="process">
            <h2>How the extraction works</h2>
            <p class="sub">
                Live demonstration with the latest KNMI analysis
                <template v-if="data?.chart.validTime">
                    (valid {{ formatTime(data.chart.validTime, false) }})</template>.
            </p>

            <div v-if="error" class="notice error">
                {{ error }} — is the backend (<code>server/</code>) running?
            </div>

            <template v-else>
                <div class="step">
                    <h3><span class="num">1</span> Load KNMI chart</h3>
                    <p>
                        The backend mirrors the current analysis chart from
                        <a v-if="data" :href="data.chart.originUrl" target="_blank" rel="noopener">knmi.nl</a><template v-else>knmi.nl</template>
                        every hour. This GIF is the only public form of the front data —
                        there is no machine-readable feed.
                    </p>
                    <img v-if="data" class="step-media" :src="resolveMediaUrl(data.chart.url)" alt="Latest KNMI chart" />
                </div>

                <div class="step">
                    <h3><span class="num">2</span> Isolate front lines and markers</h3>
                    <p>
                        The chart uses an exact color palette: cold fronts are pure blue,
                        warm fronts pure red, occlusions purple, and the H/L pressure
                        letters share those colors. Per color the pixels are masked,
                        connected components are traced to centerlines (thinning removes
                        the triangle/semicircle symbols), fragments cut by overdrawn isobars
                        and labels are re-joined, and letter-shaped components become
                        pressure centers.
                    </p>
                    <div class="pair">
                        <figure>
                            <canvas ref="overlayCanvas" class="step-media" />
                            <figcaption>Traced centerlines over the chart</figcaption>
                        </figure>
                        <figure>
                            <canvas ref="linesCanvas" class="step-media" />
                            <figcaption>Extracted geometry only</figcaption>
                        </figure>
                    </div>
                </div>

                <div class="step">
                    <h3><span class="num">3</span> Convert projection to coordinates</h3>
                    <p>
                        The chart is drawn in a polar stereographic projection. Its four
                        parameters (pole position, scale, central meridian) were fitted
                        against the chart's 10° graticule with a median error of ~0.25 px,
                        so every traced pixel maps to a latitude/longitude. Below: the same
                        geometry in plain coordinates.
                    </p>
                    <svg
                        v-if="coordinatePlot"
                        class="step-media coordplot"
                        :viewBox="coordinatePlot.viewBox"
                        preserveAspectRatio="xMidYMid meet"
                    >
                        <path :d="coordinatePlot.graticule" stroke="#3a4a66" stroke-width="0.15" fill="none" />
                        <text
                            v-for="(l, i) in coordinatePlot.labels"
                            :key="i"
                            :x="l.x"
                            :y="l.y"
                            font-size="2.2"
                            fill="#93a1b8"
                        >{{ l.text }}</text>
                        <path
                            v-for="(p, i) in coordinatePlot.paths"
                            :key="'p' + i"
                            :d="p.d"
                            :stroke="p.color"
                            stroke-width="0.45"
                            fill="none"
                            stroke-linejoin="round"
                            stroke-linecap="round"
                        />
                    </svg>
                </div>

                <div class="step">
                    <h3><span class="num">4</span> Place on map</h3>
                    <p>
                        The resulting GeoJSON is served by the backend and rendered on the
                        map — here with plain lines; the Windy plugin adds the classic
                        front symbology (triangles, semicircles) and follows the Windy
                        timeline.
                    </p>
                    <div ref="mapContainer" class="step-media leaflet-map" />
                </div>
            </template>
        </section>
    </main>
</template>

<style scoped>
main {
    padding: 28px 24px 48px;
    max-width: 1100px;
    margin: 0 auto;
}

h1 {
    margin: 0;
    font-size: 26px;
}

h2 {
    margin: 0 0 4px;
    font-size: 21px;
}

.sub {
    color: var(--muted);
    margin: 6px 0 0;
}

.hero-shots {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 20px;
}

@media (max-width: 700px) {
    .hero-shots {
        grid-template-columns: 1fr;
    }
}

.hero-shots figure {
    margin: 0;
}

.hero-shots img {
    width: 100%;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: #fff;
}

.shot-placeholder {
    aspect-ratio: 16 / 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px dashed var(--border);
    border-radius: 10px;
    color: var(--muted);
    font-size: 13px;
    text-align: center;
    padding: 12px;
}

.hero-shots figcaption {
    color: var(--muted);
    font-size: 13px;
    margin-top: 6px;
}

.cta {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 22px;
}

.install {
    background: var(--accent);
    color: #0c1017;
    font-weight: 700;
    padding: 10px 26px;
    border-radius: 8px;
    text-decoration: none;
}

.install:hover {
    filter: brightness(1.1);
    text-decoration: none;
}

.secondary {
    color: var(--muted);
    font-size: 14px;
}

.process {
    margin-top: 48px;
    border-top: 1px solid var(--border);
    padding-top: 28px;
}

.step {
    margin-top: 32px;
}

.step h3 {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 17px;
    margin: 0 0 6px;
}

.num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--accent);
    color: #0c1017;
    font-size: 14px;
    font-weight: 700;
    flex: none;
}

.step p {
    color: var(--muted);
    font-size: 14px;
    margin: 0 0 12px;
    max-width: 75ch;
}

.step-media {
    width: 100%;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: #fff;
    display: block;
}

.pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
}

@media (max-width: 800px) {
    .pair {
        grid-template-columns: 1fr;
    }
}

.pair figure {
    margin: 0;
}

.pair figcaption {
    color: var(--muted);
    font-size: 13px;
    margin-top: 6px;
}

.coordplot {
    background: #141b28;
    aspect-ratio: 16 / 10;
}

.leaflet-map {
    height: 480px;
    background: #141b28;
}

.notice.error {
    padding: 24px;
    text-align: center;
    color: #ff9a9a;
}
</style>
