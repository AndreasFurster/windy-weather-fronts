/** Types for the front-chart image mirror (no hotlinking: the backend
 * downloads every chart image and serves the local copy). */

export interface ChartImage {
    /** Origin URL of the image (or of the video the frame was taken from). */
    url: string;
    /** Human readable label, e.g. 'Analysis' or '+24 h'. */
    label: string;
    /** Valid time (ISO 8601) when derivable from the source. */
    validTime?: string;
    forecastHours?: number;
    /** Defaults to 'image'; 'video' entries are mirrored and served as-is. */
    mediaType?: 'image' | 'video';
    /** Pre-produced content (e.g. video frames extracted with ffmpeg); when
     * set the collector writes this instead of downloading `url`. */
    data?: Uint8Array;
    /** Filename override, required when `data` is set. */
    fileName?: string;
}

export interface ChartSource {
    id: string;
    name: string;
    region: string;
    attribution: string;
    /** Public page the images were found on (used for attribution links). */
    pageUrl: string;
    refreshMinutes: number;
    /** Scrape the source and return the current chart images. */
    list(): Promise<ChartImage[]>;
}

export interface StoredChart {
    /** Filename inside data/charts/<sourceId>/ (fs backend) or the blob
     * pathname's basename (Blob backend). */
    file: string;
    label: string;
    validTime?: string;
    forecastHours?: number;
    mediaType: 'image' | 'video';
    originUrl: string;
    /** Where to fetch the mirrored copy from: a relative `/charts/...` path
     * (fs backend, resolved against the API host) or an absolute Vercel Blob
     * URL (Blob backend). Set once at write time so API handlers can return
     * it as-is. */
    url: string;
}

export interface ChartSourceIndex {
    id: string;
    name: string;
    region: string;
    attribution: string;
    pageUrl: string;
    available: boolean;
    fetchedAt: string | null;
    error?: string;
    charts: StoredChart[];
}
