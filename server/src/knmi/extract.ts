/**
 * Vectorizes the front lines from a KNMI surface chart image.
 *
 * The GIF uses an exact palette, so fronts can be isolated per color:
 *   cold      rgb(0, 0, 255)
 *   warm      rgb(255, 0, 0)
 *   occluded  rgb(160, 32, 240)
 *
 * The H/L pressure letters share the cold/warm colors; isolated letter-shaped
 * components are extracted as high/low pressure centers (blue H = high,
 * red L = low). Stationary fronts are drawn as alternating red/blue segments;
 * chains of at least three short alternating segments are merged back into a
 * single stationary front.
 */

import type { RgbaImage } from './gif.js';
import type { FrontsFeature, FrontType } from '../types.js';
import {
    chaikinSmooth,
    connectedComponents,
    maskColor,
    pathPixelLength,
    traceComponent,
    type Component,
    type PixelPoint,
} from './image.js';
import { KNMI_CHART_PARAMS, pxToLatLon, type StereoParams } from './georef.js';

const COLORS: { color: [number, number, number]; type: FrontType }[] = [
    { color: [0, 0, 255], type: 'cold' },
    { color: [255, 0, 0], type: 'warm' },
    { color: [160, 32, 240], type: 'occluded' },
];

/** Components smaller than this box are letters (H/L) or noise; the H glyph
 * measures 21x29 px. */
const LETTER_BOX = 34;
/** Minimum pixels for a component to be considered at all. */
const MIN_PIXELS = 12;
/** Traced paths shorter than this may be part of a stationary front chain. */
const CHAIN_MAX_LEN = 90;
/** Max gap between segment endpoints to chain them. */
const CHAIN_GAP = 12;
/**
 * Isobars, coastlines and text labels are drawn over the front lines and cut
 * them into fragments; same-type fragments whose endpoints are within this
 * gap are unconditionally re-joined.
 */
const BRIDGE_GAP = 9;
/**
 * Wider labels (e.g. "1005" drawn across a front) cut gaps of up to ~25 px.
 * Fragments this far apart are only re-joined when the line direction
 * continues across the gap (see directionsAlign), so unrelated parallel
 * fronts are never glued together.
 */
const BRIDGE_GAP_ALIGNED = 26;
/** Max angle (deg) between end tangent, bridge vector and start tangent for
 * a long-gap bridge to count as "continuing the same line". */
const BRIDGE_MAX_ANGLE = 42;
/** Merged paths that remain letter-sized and short are H/L letters: drop.
 * The skeleton of an "H" glyph is ~60px (down one stroke, across, down the
 * other), so anything letter-boxed under 70px is discarded. */
const LETTER_MAX_PATH = 70;

interface TracedFront {
    type: FrontType;
    points: PixelPoint[];
    pixelLength: number;
    /** True when the bounding box is letter-sized. */
    tiny: boolean;
}

export interface PixelFront {
    type: FrontType;
    points: PixelPoint[];
    derived?: boolean;
}

export interface PixelCenter {
    centerType: 'high' | 'low';
    x: number;
    y: number;
}

export interface PixelExtraction {
    fronts: PixelFront[];
    centers: PixelCenter[];
}

/**
 * The H (blue) and L (red) pressure-center letters share the front colors.
 * A component is treated as a letter when its bounding box and pixel count
 * match the glyph metrics (H measures 22x30 px / ~296 px, L 20x30 / ~184 px;
 * letters partially overdrawn by front lines come out a little smaller).
 */
function isLetterShaped(comp: Component): boolean {
    const w = comp.maxX - comp.minX + 1;
    const h = comp.maxY - comp.minY + 1;
    return w >= 12 && w <= 30 && h >= 22 && h <= 32
        && comp.pixels.length >= 100 && comp.pixels.length <= 350;
}

/** Letters stand alone while front symbol clusters sit close to their line:
 * a letter candidate is rejected when another substantial (>= 30 px)
 * same-color component lies within this gap. */
const LETTER_ISOLATION = 15;
const LETTER_NEIGHBOR_MIN_PIXELS = 30;

function bboxGap(a: Component, b: Component): number {
    const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
    const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
    return Math.hypot(dx, dy);
}

/** Extraction result in image pixel coordinates (used by preview tooling). */
export function extractPixelChart(img: RgbaImage): PixelExtraction {
    let traced: TracedFront[] = [];
    const centers: PixelCenter[] = [];

    for (const { color, type } of COLORS) {
        const mask = maskColor(img, color[0], color[1], color[2]);
        const comps = connectedComponents(mask, img.width, img.height)
            .filter(c => c.pixels.length >= MIN_PIXELS);
        const centerType = type === 'cold' ? 'high' : type === 'warm' ? 'low' : null;

        for (const comp of comps) {
            if (
                centerType
                && isLetterShaped(comp)
                && comps.every(o =>
                    o === comp
                    || o.pixels.length < LETTER_NEIGHBOR_MIN_PIXELS
                    || bboxGap(comp, o) > LETTER_ISOLATION)
            ) {
                centers.push({
                    centerType,
                    x: (comp.minX + comp.maxX) / 2,
                    y: (comp.minY + comp.maxY) / 2,
                });
                continue;
            }

            const points = traceComponent(comp, img.width);
            if (!points || points.length < 2) continue;
            const w = comp.maxX - comp.minX;
            const h = comp.maxY - comp.minY;
            traced.push({
                type,
                points,
                pixelLength: pathPixelLength(points),
                tiny: w < LETTER_BOX && h < LETTER_BOX,
            });
        }
    }

    traced = mergeFragments(traced);

    const { merged, consumed } = mergeStationaryChains(traced);
    const fronts: PixelFront[] = [];

    for (const chain of merged) {
        fronts.push({ type: 'stationary', points: chaikinSmooth(chain), derived: true });
    }
    for (const t of traced) {
        if (consumed.has(t)) continue;
        if (t.tiny && t.pixelLength < LETTER_MAX_PATH) continue; // leftover letter bits
        fronts.push({ type: t.type, points: chaikinSmooth(t.points) });
    }
    return { fronts, centers };
}

/**
 * Re-join same-type fragments cut apart by overdrawn isobars, coastlines and
 * labels. Greedy: repeatedly merge the joinable pair with the smallest
 * endpoint gap. Small gaps (<= BRIDGE_GAP) merge unconditionally; larger
 * gaps (<= BRIDGE_GAP_ALIGNED, e.g. a front passing under a "1005" label)
 * only when the line direction continues across the gap.
 */
function mergeFragments(paths: TracedFront[]): TracedFront[] {
    const list = paths.slice();
    let mergedSomething = true;

    while (mergedSomething) {
        mergedSomething = false;
        let best: { i: number; j: number; join: Join; gap: number } | null = null;

        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                if (list[i].type !== list[j].type) continue;
                const join = bestJoin(list[i].points, list[j].points);
                if (join.gap > BRIDGE_GAP_ALIGNED) continue;
                if (join.gap > BRIDGE_GAP && !directionsAlign(join)) continue;
                if (!best || join.gap < best.gap) best = { i, j, join, gap: join.gap };
            }
        }

        if (best) {
            const a = list[best.i], b = list[best.j];
            const points = best.join.merge();
            list[best.i] = {
                type: a.type,
                points,
                pixelLength: pathPixelLength(points),
                tiny: a.tiny && b.tiny,
            };
            list.splice(best.j, 1);
            mergedSomething = true;
        }
    }
    return list;
}

interface Join {
    gap: number;
    /** Tangent leaving path A at the joined end (unit vector). */
    outA: [number, number];
    /** Tangent entering path B at the joined end (unit vector). */
    inB: [number, number];
    /** Bridge vector from A's end to B's start (unit vector; zero gap -> null). */
    bridge: [number, number] | null;
    merge: () => PixelPoint[];
}

/** Tangent at the last point of a polyline, taken over the trailing ~6 px
 * for stability against pixel jitter. */
function endTangent(pts: PixelPoint[]): [number, number] {
    const last = pts[pts.length - 1];
    let ref = pts[pts.length - 2] ?? last;
    for (let i = pts.length - 2; i >= 0; i--) {
        ref = pts[i];
        if (Math.hypot(last[0] - ref[0], last[1] - ref[1]) >= 6) break;
    }
    const len = Math.hypot(last[0] - ref[0], last[1] - ref[1]) || 1;
    return [(last[0] - ref[0]) / len, (last[1] - ref[1]) / len];
}

/** Best (smallest-gap) way to concatenate two polylines end-to-end. */
function bestJoin(a: PixelPoint[], b: PixelPoint[]): Join {
    const d = (p: PixelPoint, q: PixelPoint) => Math.hypot(p[0] - q[0], p[1] - q[1]);

    const options: { gap: number; a2: PixelPoint[]; b2: PixelPoint[] }[] = [
        { gap: d(a[a.length - 1], b[0]), a2: a, b2: b },
        { gap: d(a[a.length - 1], b[b.length - 1]), a2: a, b2: b.slice().reverse() },
        { gap: d(a[0], b[0]), a2: a.slice().reverse(), b2: b },
        { gap: d(a[0], b[b.length - 1]), a2: b, b2: a },
    ];
    options.sort((x, y) => x.gap - y.gap);
    const { gap, a2, b2 } = options[0];

    const endA = a2[a2.length - 1];
    const startB = b2[0];
    const bridge: [number, number] | null = gap > 0.5
        ? [(startB[0] - endA[0]) / gap, (startB[1] - endA[1]) / gap]
        : null;

    return {
        gap,
        outA: endTangent(a2),
        inB: endTangent(b2.slice().reverse()).map(v => -v) as [number, number],
        bridge,
        merge: () => [...a2, ...b2],
    };
}

/** True when A's exit direction, the bridge and B's entry direction all
 * point the same way (within BRIDGE_MAX_ANGLE). */
function directionsAlign(join: Join): boolean {
    const cosMin = Math.cos((BRIDGE_MAX_ANGLE * Math.PI) / 180);
    const dot = (u: [number, number], v: [number, number]) => u[0] * v[0] + u[1] * v[1];
    if (!join.bridge) return true;
    return dot(join.outA, join.bridge) >= cosMin
        && dot(join.bridge, join.inB) >= cosMin
        && dot(join.outA, join.inB) >= cosMin;
}

export function extractFronts(
    img: RgbaImage,
    params: StereoParams = KNMI_CHART_PARAMS,
): FrontsFeature[] {
    const { fronts, centers } = extractPixelChart(img);
    const features: FrontsFeature[] = fronts.map(f =>
        toFeature(f.points, f.type, params, f.derived ?? false));

    for (const c of centers) {
        const [lat, lon] = pxToLatLon(c.x, c.y, params);
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lon, lat] },
            properties: { kind: 'pressure-center', centerType: c.centerType },
        });
    }
    return features;
}

function toFeature(
    points: PixelPoint[],
    frontType: FrontType,
    params: StereoParams,
    derived = false,
): FrontsFeature {
    return {
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: points.map(([x, y]) => {
                const [lat, lon] = pxToLatLon(x, y, params);
                return [lon, lat] as [number, number];
            }),
        },
        properties: { kind: 'front', frontType, ...(derived ? { derived: true } : {}) },
    };
}

/**
 * Stationary fronts on the chart alternate short red and blue segments.
 * Chains of >= 3 short cold/warm segments whose endpoints (nearly) touch and
 * whose colors alternate are merged into one polyline.
 */
function mergeStationaryChains(traced: TracedFront[]): {
    merged: PixelPoint[][];
    consumed: Set<TracedFront>;
} {
    const candidates = traced.filter(
        t => (t.type === 'cold' || t.type === 'warm') && t.pixelLength < CHAIN_MAX_LEN,
    );

    // Adjacency between candidates: endpoints close and colors alternating.
    const links = new Map<TracedFront, TracedFront[]>();
    for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
            const a = candidates[i], b = candidates[j];
            if (a.type === b.type) continue;
            if (endpointGap(a.points, b.points) > CHAIN_GAP) continue;
            if (!links.has(a)) links.set(a, []);
            if (!links.has(b)) links.set(b, []);
            links.get(a)!.push(b);
            links.get(b)!.push(a);
        }
    }

    // Collect connected groups.
    const consumed = new Set<TracedFront>();
    const merged: PixelPoint[][] = [];
    const visited = new Set<TracedFront>();

    for (const start of links.keys()) {
        if (visited.has(start)) continue;
        const group: TracedFront[] = [];
        const stack = [start];
        visited.add(start);
        while (stack.length) {
            const cur = stack.pop()!;
            group.push(cur);
            for (const next of links.get(cur) ?? []) {
                if (!visited.has(next)) { visited.add(next); stack.push(next); }
            }
        }
        if (group.length < 3) continue;

        const chain = orderChain(group);
        if (!chain) continue;
        for (const member of group) consumed.add(member);
        merged.push(chain);
    }

    return { merged, consumed };
}

function endpointGap(a: PixelPoint[], b: PixelPoint[]): number {
    const ends = (pts: PixelPoint[]) => [pts[0], pts[pts.length - 1]];
    let min = Infinity;
    for (const pa of ends(a)) {
        for (const pb of ends(b)) {
            min = Math.min(min, Math.hypot(pa[0] - pb[0], pa[1] - pb[1]));
        }
    }
    return min;
}

/** Order chain members end-to-end into one polyline (greedy nearest end). */
function orderChain(group: TracedFront[]): PixelPoint[] | null {
    const remaining = new Set(group);
    // Start from the member farthest from the group's centroid so the walk
    // begins at one extremity of the chain.
    let cx = 0, cy = 0, n = 0;
    for (const g of group) for (const p of g.points) { cx += p[0]; cy += p[1]; n++; }
    cx /= n; cy /= n;

    let start = group[0], best = -1;
    for (const g of group) {
        for (const p of [g.points[0], g.points[g.points.length - 1]]) {
            const d = Math.hypot(p[0] - cx, p[1] - cy);
            if (d > best) { best = d; start = g; }
        }
    }

    const result: PixelPoint[] = [];
    let current = start;
    let currentPoints = current.points.slice();
    remaining.delete(current);

    // Orient the first segment so its tail faces the rest of the chain.
    if (remaining.size) {
        const gapFromTail = (pts: PixelPoint[]) => {
            const tail = pts[pts.length - 1];
            let min = Infinity;
            for (const other of remaining) {
                for (const p of [other.points[0], other.points[other.points.length - 1]]) {
                    min = Math.min(min, Math.hypot(tail[0] - p[0], tail[1] - p[1]));
                }
            }
            return min;
        };
        if (gapFromTail(currentPoints.slice().reverse()) < gapFromTail(currentPoints)) {
            currentPoints.reverse();
        }
    }

    while (true) {
        // Orient so that result tail connects to currentPoints head.
        if (result.length) {
            const tail = result[result.length - 1];
            const dHead = Math.hypot(tail[0] - currentPoints[0][0], tail[1] - currentPoints[0][1]);
            const dTail = Math.hypot(
                tail[0] - currentPoints[currentPoints.length - 1][0],
                tail[1] - currentPoints[currentPoints.length - 1][1]);
            if (dTail < dHead) currentPoints.reverse();
        }
        result.push(...currentPoints);

        if (!remaining.size) break;

        // Pick the closest remaining member to the chain tail.
        const tail = result[result.length - 1];
        let next: TracedFront | null = null;
        let bestDist = Infinity;
        for (const cand of remaining) {
            const d = Math.min(
                Math.hypot(tail[0] - cand.points[0][0], tail[1] - cand.points[0][1]),
                Math.hypot(
                    tail[0] - cand.points[cand.points.length - 1][0],
                    tail[1] - cand.points[cand.points.length - 1][1]));
            if (d < bestDist) { bestDist = d; next = cand; }
        }
        if (!next || bestDist > CHAIN_GAP * 2) return null;
        remaining.delete(next);
        current = next;
        currentPoints = current.points.slice();
    }

    return result;
}
