import { GifReader } from 'omggif';

export interface RgbaImage {
    width: number;
    height: number;
    /** RGBA, 4 bytes per pixel. */
    data: Uint8Array;
}

export function decodeGif(buf: Uint8Array): RgbaImage {
    const reader = new GifReader(buf);
    const width = reader.width;
    const height = reader.height;
    const data = new Uint8Array(width * height * 4);
    reader.decodeAndBlitFrameRGBA(0, data);
    return { width, height, data };
}
