/**
 * Raster utilities used to vectorize front lines from the KNMI chart images:
 * exact-color masking, connected component labeling, Zhang-Suen thinning,
 * spur pruning, longest-path tracing and Douglas-Peucker simplification.
 */

import type { RgbaImage } from './gif.js';

export interface Component {
    /** Pixel indices (y * width + x) in image coordinates. */
    pixels: number[];
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export type PixelPoint = [number, number];

/** Binary mask of pixels exactly matching the given palette color. */
export function maskColor(img: RgbaImage, r: number, g: number, b: number): Uint8Array {
    const n = img.width * img.height;
    const mask = new Uint8Array(n);
    const d = img.data;
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        if (d[o] === r && d[o + 1] === g && d[o + 2] === b) mask[i] = 1;
    }
    return mask;
}

/** 8-connected component labeling via BFS. */
export function connectedComponents(mask: Uint8Array, width: number, height: number): Component[] {
    const visited = new Uint8Array(mask.length);
    const components: Component[] = [];
    const queue = new Int32Array(mask.length);

    for (let start = 0; start < mask.length; start++) {
        if (!mask[start] || visited[start]) continue;

        const comp: Component = {
            pixels: [],
            minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
        };
        let head = 0, tail = 0;
        queue[tail++] = start;
        visited[start] = 1;

        while (head < tail) {
            const idx = queue[head++];
            comp.pixels.push(idx);
            const x = idx % width;
            const y = (idx / width) | 0;
            if (x < comp.minX) comp.minX = x;
            if (x > comp.maxX) comp.maxX = x;
            if (y < comp.minY) comp.minY = y;
            if (y > comp.maxY) comp.maxY = y;

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    const nIdx = ny * width + nx;
                    if (mask[nIdx] && !visited[nIdx]) {
                        visited[nIdx] = 1;
                        queue[tail++] = nIdx;
                    }
                }
            }
        }
        components.push(comp);
    }
    return components;
}

/**
 * Extract the centerline of a line-shaped component as an ordered pixel
 * polyline (image coordinates). Returns null for blob-like components that
 * yield no usable path.
 */
export function traceComponent(
    comp: Component,
    imgWidth: number,
    opts: { maxSpur?: number; simplifyEps?: number } = {},
): PixelPoint[] | null {
    const maxSpur = opts.maxSpur ?? 12;
    const simplifyEps = opts.simplifyEps ?? 1.8;

    // Work on a padded crop of the component.
    const pad = 1;
    const w = comp.maxX - comp.minX + 1 + pad * 2;
    const h = comp.maxY - comp.minY + 1 + pad * 2;
    const bitmap = new Uint8Array(w * h);
    for (const idx of comp.pixels) {
        const x = (idx % imgWidth) - comp.minX + pad;
        const y = ((idx / imgWidth) | 0) - comp.minY + pad;
        bitmap[y * w + x] = 1;
    }

    thin(bitmap, w, h);
    pruneSpurs(bitmap, w, h, maxSpur);

    const path = longestPath(bitmap, w, h);
    if (!path || path.length < 2) return null;

    const points: PixelPoint[] = path.map(idx => [
        (idx % w) + comp.minX - pad,
        ((idx / w) | 0) + comp.minY - pad,
    ]);
    return simplifyPath(points, simplifyEps);
}

/** Zhang-Suen thinning, in place. */
function thin(bitmap: Uint8Array, w: number, h: number): void {
    const toRemove: number[] = [];
    let changed = true;

    while (changed) {
        changed = false;
        for (let step = 0; step < 2; step++) {
            toRemove.length = 0;
            for (let y = 1; y < h - 1; y++) {
                for (let x = 1; x < w - 1; x++) {
                    const i = y * w + x;
                    if (!bitmap[i]) continue;
                    // Neighbors clockwise from north: p2..p9.
                    const p2 = bitmap[i - w], p3 = bitmap[i - w + 1], p4 = bitmap[i + 1];
                    const p5 = bitmap[i + w + 1], p6 = bitmap[i + w], p7 = bitmap[i + w - 1];
                    const p8 = bitmap[i - 1], p9 = bitmap[i - w - 1];

                    const bSum = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
                    if (bSum < 2 || bSum > 6) continue;

                    const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
                    let a = 0;
                    for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) a++;
                    if (a !== 1) continue;

                    if (step === 0) {
                        if (p2 && p4 && p6) continue;
                        if (p4 && p6 && p8) continue;
                    } else {
                        if (p2 && p4 && p8) continue;
                        if (p2 && p6 && p8) continue;
                    }
                    toRemove.push(i);
                }
            }
            if (toRemove.length) {
                changed = true;
                for (const i of toRemove) bitmap[i] = 0;
            }
        }
    }
}

function neighborIndices(i: number, w: number): number[] {
    return [i - w - 1, i - w, i - w + 1, i - 1, i + 1, i + w - 1, i + w, i + w + 1];
}

function degree(bitmap: Uint8Array, i: number, w: number): number {
    let d = 0;
    for (const n of neighborIndices(i, w)) if (bitmap[n]) d++;
    return d;
}

/**
 * Remove short skeleton branches (spurs) caused by the triangle/semicircle
 * symbols along the fronts. A spur is a path from an endpoint to a junction
 * of at most maxLen pixels.
 */
function pruneSpurs(bitmap: Uint8Array, w: number, h: number, maxLen: number): void {
    let removedSomething = true;
    while (removedSomething) {
        removedSomething = false;
        for (let i = 0; i < bitmap.length; i++) {
            if (!bitmap[i] || degree(bitmap, i, w) !== 1) continue;

            // Walk from the endpoint until a junction or the other end.
            const walked: number[] = [i];
            let prev = -1;
            let cur = i;
            let hitJunction = false;

            while (walked.length <= maxLen) {
                let next = -1;
                for (const n of neighborIndices(cur, w)) {
                    if (bitmap[n] && n !== prev && !walked.includes(n)) { next = n; break; }
                }
                if (next === -1) break; // isolated short segment: keep it
                if (degree(bitmap, next, w) > 2) { hitJunction = true; break; }
                walked.push(next);
                prev = cur;
                cur = next;
            }

            if (hitJunction) {
                for (const p of walked) bitmap[p] = 0;
                removedSomething = true;
            }
        }
    }
}

/** Longest path through the skeleton via double BFS. */
function longestPath(bitmap: Uint8Array, w: number, h: number): number[] | null {
    let anyPixel = -1;
    for (let i = 0; i < bitmap.length; i++) if (bitmap[i]) { anyPixel = i; break; }
    if (anyPixel === -1) return null;

    const bfs = (start: number): { far: number; parent: Int32Array } => {
        const parent = new Int32Array(bitmap.length).fill(-2);
        const queue: number[] = [start];
        parent[start] = -1;
        let far = start;
        let head = 0;
        while (head < queue.length) {
            const cur = queue[head++];
            far = cur;
            for (const n of neighborIndices(cur, w)) {
                if (n < 0 || n >= bitmap.length) continue;
                if (bitmap[n] && parent[n] === -2) {
                    parent[n] = cur;
                    queue.push(n);
                }
            }
        }
        return { far, parent };
    };

    const { far: a } = bfs(anyPixel);
    const { far: b, parent } = bfs(a);

    const path: number[] = [];
    for (let cur = b; cur !== -1; cur = parent[cur]) path.push(cur);
    return path;
}

/** Douglas-Peucker polyline simplification. */
export function simplifyPath(points: PixelPoint[], eps: number): PixelPoint[] {
    if (points.length <= 2) return points;

    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack: [number, number][] = [[0, points.length - 1]];

    while (stack.length) {
        const [s, e] = stack.pop()!;
        const [x1, y1] = points[s];
        const [x2, y2] = points[e];
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;

        let maxDist = 0, maxIdx = -1;
        for (let i = s + 1; i < e; i++) {
            const [px, py] = points[i];
            const dist = Math.abs(dx * (y1 - py) - dy * (x1 - px)) / len;
            if (dist > maxDist) { maxDist = dist; maxIdx = i; }
        }
        if (maxDist > eps && maxIdx > 0) {
            keep[maxIdx] = 1;
            stack.push([s, maxIdx], [maxIdx, e]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

/**
 * Chaikin corner cutting: rounds the hard corners left by Douglas-Peucker
 * simplification so fronts render as smooth curves. Endpoints are preserved.
 */
export function chaikinSmooth(points: PixelPoint[], iterations = 2): PixelPoint[] {
    let pts = points;
    for (let it = 0; it < iterations; it++) {
        if (pts.length < 3) return pts;
        const out: PixelPoint[] = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
            const [ax, ay] = pts[i];
            const [bx, by] = pts[i + 1];
            out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
            out.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
        }
        out.push(pts[pts.length - 1]);
        pts = out;
    }
    return pts;
}

export function pathPixelLength(points: PixelPoint[]): number {
    let len = 0;
    for (let i = 1; i < points.length; i++) {
        len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    }
    return len;
}
