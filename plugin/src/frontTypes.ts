/** Types mirroring the backend API (server/src/types.ts). */

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
    strength?: string;
    derived?: boolean;
}

export interface PressureCenterProperties {
    kind: 'pressure-center';
    centerType: 'high' | 'low';
    pressure?: number;
}

export interface FrontFeature {
    type: 'Feature';
    geometry: { type: 'LineString'; coordinates: [number, number][] };
    properties: FrontProperties;
}

export interface CenterFeature {
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: PressureCenterProperties;
}

export type FrontsFeature = FrontFeature | CenterFeature;

export interface FeatureCollection {
    type: 'FeatureCollection';
    features: FrontsFeature[];
}

export interface TimeInfo {
    validTime: string;
    forecastHours: number;
}

export interface SourceListing {
    id: string;
    name: string;
    region: string;
    attribution: string;
    bounds: [number, number, number, number];
    method: 'coded-bulletin' | 'image-extraction';
    refreshMinutes: number;
    available: boolean;
    issuedTime: string | null;
    fetchedAt: string | null;
    times: TimeInfo[];
}

export interface FrontsTimestep {
    validTime: string;
    forecastHours: number;
    geojson: FeatureCollection;
}

export interface SourceDataset extends Omit<SourceListing, 'available' | 'times'> {
    sourceId: string;
    issuedTime?: string;
    fetchedAt: string;
    timesteps: FrontsTimestep[];
}
