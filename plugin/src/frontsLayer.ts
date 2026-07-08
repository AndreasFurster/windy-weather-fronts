/**
 * Renders front lines with classic weather-map symbology on the Windy map:
 * triangles for cold fronts, semicircles for warm fronts, alternating for
 * occlusions (same side) and stationary fronts (opposite sides, alternating
 * color). Symbols are built in screen space and recomputed on zoom so they
 * keep a constant pixel size.
 */

import { map } from '@windy/map';

import type { CenterFeature, FrontFeature, FrontsFeature, FrontType } from './frontTypes';

const COLORS: Record<FrontType, string> = {
    cold: '#1e64dc',
    warm: '#d63031',
    occluded: '#9932cc',
    stationary: '#1e64dc', // base line; red dashes drawn on top
    trough: '#c47f17',
    instability: '#c2185b',
    intertropical: '#e6821e',
    convergence: '#e6821e',
};

const LINE_WEIGHT = 3;
const SYMBOL_SIZE = 7;
const SYMBOL_SPACING = 52;

interface SymbolPos {
    x: number;
    y: number;
    /** Unit tangent along the line. */
    ux: number;
    uy: number;
}

export class FrontsLayer {
    private group: L.LayerGroup | null = null;
    private symbols: L.LayerGroup | null = null;
    private fronts: FrontFeature[] = [];
    private onZoom = (): void => this.drawSymbols();

    show(features: FrontsFeature[]): void {
        this.clear();
        this.group = new L.LayerGroup();
        this.symbols = new L.LayerGroup();

        this.fronts = features.filter((f): f is FrontFeature => f.properties.kind === 'front');
        const centers = features.filter(
            (f): f is CenterFeature => f.properties.kind === 'pressure-center');

        for (const front of this.fronts) {
            const latlngs = toLatLngs(front);
            const type = front.properties.frontType;
            const dashed = type === 'trough' || type === 'instability'
                || type === 'intertropical' || type === 'convergence';

            this.group.addLayer(new L.Polyline(latlngs, {
                color: COLORS[type],
                weight: LINE_WEIGHT,
                opacity: 0.9,
                interactive: false,
                ...(dashed ? { dashArray: '8 8' } : {}),
            }));

            if (type === 'stationary') {
                // Alternating red segments over the blue base line.
                this.group.addLayer(new L.Polyline(latlngs, {
                    color: COLORS.warm,
                    weight: LINE_WEIGHT,
                    opacity: 0.9,
                    dashArray: '14 14',
                    interactive: false,
                }));
            }
        }

        for (const center of centers) {
            const [lon, lat] = center.geometry.coordinates;
            const { centerType, pressure } = center.properties;
            const color = centerType === 'high' ? '#1e64dc' : '#d63031';
            const letter = centerType === 'high' ? 'H' : 'L';
            const html =
                `<div style="font:bold 20px/20px Arial,sans-serif;color:${color};` +
                'text-align:center;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;">' +
                letter +
                (pressure
                    ? `<div style="font:bold 10px/11px Arial,sans-serif;color:#444;">${pressure}</div>`
                    : '') +
                '</div>';
            this.group.addLayer(new L.Marker([lat, lon], {
                icon: new L.DivIcon({ html, className: '', iconSize: [30, 32], iconAnchor: [15, 13] }),
                interactive: false,
            }));
        }

        this.group.addLayer(this.symbols);
        map.addLayer(this.group);
        this.drawSymbols();
        map.on('zoomend', this.onZoom);
    }

    clear(): void {
        if (this.group) {
            map.off('zoomend', this.onZoom);
            map.removeLayer(this.group);
            this.group = null;
            this.symbols = null;
            this.fronts = [];
        }
    }

    private drawSymbols(): void {
        if (!this.symbols) return;
        this.symbols.clearLayers();

        for (const front of this.fronts) {
            const type = front.properties.frontType;
            if (type === 'trough' || type === 'instability'
                || type === 'intertropical' || type === 'convergence') continue;

            const positions = symbolPositions(toLatLngs(front), SYMBOL_SPACING);
            positions.forEach((pos, i) => {
                let shape: 'triangle' | 'semicircle';
                let color = COLORS[type];
                let flip = false;

                if (type === 'cold') {
                    shape = 'triangle';
                } else if (type === 'warm') {
                    shape = 'semicircle';
                } else if (type === 'occluded') {
                    shape = i % 2 === 0 ? 'triangle' : 'semicircle';
                } else {
                    // stationary: cold and warm symbols on opposite sides
                    shape = i % 2 === 0 ? 'triangle' : 'semicircle';
                    color = i % 2 === 0 ? COLORS.cold : COLORS.warm;
                    flip = i % 2 !== 0;
                }

                const pixels = shape === 'triangle'
                    ? trianglePoints(pos, SYMBOL_SIZE, flip)
                    : semicirclePoints(pos, SYMBOL_SIZE, flip);
                const latlngs = pixels.map(([x, y]) =>
                    map.layerPointToLatLng(new L.Point(x, y)));

                this.symbols!.addLayer(new L.Polygon(latlngs, {
                    stroke: false,
                    fillColor: color,
                    fillOpacity: 0.95,
                    interactive: false,
                }));
            });
        }
    }
}

function toLatLngs(front: FrontFeature): L.LatLng[] {
    return front.geometry.coordinates.map(([lon, lat]) => new L.LatLng(lat, lon));
}

/** Equally spaced positions (layer pixels) along a polyline. */
function symbolPositions(latlngs: L.LatLng[], spacing: number): SymbolPos[] {
    const pts = latlngs.map(ll => map.latLngToLayerPoint(ll));
    const out: SymbolPos[] = [];
    let acc = spacing / 2;

    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (!len) continue;
        const ux = dx / len, uy = dy / len;

        while (acc <= len) {
            out.push({ x: a.x + ux * acc, y: a.y + uy * acc, ux, uy });
            acc += spacing;
        }
        acc -= len;
    }
    return out;
}

/** Filled triangle pointing to the left of the line direction. */
function trianglePoints(s: SymbolPos, size: number, flip: boolean): [number, number][] {
    const side = flip ? -1 : 1;
    const nx = s.uy * side, ny = -s.ux * side; // normal
    return [
        [s.x - s.ux * size, s.y - s.uy * size],
        [s.x + nx * size * 1.5, s.y + ny * size * 1.5],
        [s.x + s.ux * size, s.y + s.uy * size],
    ];
}

/** Filled semicircle bulging to the left of the line direction. */
function semicirclePoints(s: SymbolPos, size: number, flip: boolean): [number, number][] {
    const side = flip ? -1 : 1;
    const nx = s.uy * side, ny = -s.ux * side;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
        const th = (Math.PI * i) / 8;
        const c = Math.cos(th), si = Math.sin(th);
        pts.push([
            s.x + s.ux * size * c + nx * size * si,
            s.y + s.uy * size * c + ny * size * si,
        ]);
    }
    return pts;
}
