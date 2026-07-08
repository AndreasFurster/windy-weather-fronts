/**
 * Shared types for the weather fronts backend.
 *
 * All front geometry is exchanged as GeoJSON. Every feature carries a `kind`
 * property: `front` features are LineStrings, `pressure-center` features are
 * Points (H/L markers).
 */

export type FrontType =
    | 'cold'
    | 'warm'
    | 'occluded'
    | 'stationary'
    | 'trough'
    | 'instability'
    | 'intertropical'
    | 'convergence';

export interface FrontProperties {
    kind: 'front';
    frontType: FrontType;
    /** Optional strength qualifier as reported by the source (e.g. WK/MDT/STG). */
    strength?: string;
    /** True when the front was derived heuristically (e.g. stationary fronts
     * reconstructed from alternating red/blue image segments). */
    derived?: boolean;
}

export interface PressureCenterProperties {
    kind: 'pressure-center';
    centerType: 'high' | 'low';
    /** Central pressure in hPa, when the source reports it. */
    pressure?: number;
}

export type FrontsFeature =
    | GeoJSONFeature<GeoJSONLineString, FrontProperties>
    | GeoJSONFeature<GeoJSONPoint, PressureCenterProperties>;

export interface GeoJSONLineString {
    type: 'LineString';
    /** [lon, lat] pairs */
    coordinates: [number, number][];
}

export interface GeoJSONPoint {
    type: 'Point';
    coordinates: [number, number];
}

export interface GeoJSONFeature<G, P> {
    type: 'Feature';
    geometry: G;
    properties: P;
}

export interface FeatureCollection {
    type: 'FeatureCollection';
    features: FrontsFeature[];
}

export interface FrontsTimestep {
    /** Valid time as ISO 8601 UTC string. */
    validTime: string;
    /** Forecast lead time in hours; 0 means analysis. */
    forecastHours: number;
    geojson: FeatureCollection;
}

export interface SourceDataset {
    sourceId: string;
    /** Issue time of the underlying product, if known (ISO 8601). */
    issuedTime?: string;
    /** When this backend last successfully refreshed the source (ISO 8601). */
    fetchedAt: string;
    timesteps: FrontsTimestep[];
}

export interface SourceInfo {
    id: string;
    name: string;
    /** Human readable region the source covers. */
    region: string;
    attribution: string;
    /** Rough bounding box [west, south, east, north] used by the plugin to
     * jump to the covered area. */
    bounds: [number, number, number, number];
    /** How the data is obtained; image sources are approximate. */
    method: 'coded-bulletin' | 'image-extraction';
    refreshMinutes: number;
}

export interface FrontsSource {
    info: SourceInfo;
    /** Fetches fresh data from the origin. Must throw on failure so the
     * scheduler can keep serving the previous dataset. */
    fetch(): Promise<Omit<SourceDataset, 'sourceId' | 'fetchedAt'>>;
}
