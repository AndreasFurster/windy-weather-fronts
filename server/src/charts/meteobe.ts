/**
 * KMI/RMI (meteo.be) publishes its front charts as an MP4 animation
 * (~16 charts, valid date/time drawn in the top-left of each frame, Belgian
 * local time). When ffmpeg is available the video is split into its distinct
 * frames with the mpdecimate filter (drops duplicate frames); otherwise the
 * video itself is mirrored and shown as-is.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ChartImage, ChartSource } from './types.js';

const execFileP = promisify(execFile);

const VIDEO_URL = 'https://www.meteo.be/resources/forecasts/fronts/NL/Web2016Fronten.mp4';
const PAGE_URL = 'https://www.meteo.be/nl/weer/verwachtingen/weerkaarten';

async function ffmpegAvailable(): Promise<boolean> {
    try {
        await execFileP('ffmpeg', ['-version']);
        return true;
    } catch {
        return false;
    }
}

async function extractFrames(video: Uint8Array): Promise<ChartImage[]> {
    const dir = await mkdtemp(join(tmpdir(), 'meteobe-'));
    try {
        const videoPath = join(dir, 'fronts.mp4');
        await writeFile(videoPath, video);
        // mpdecimate drops near-duplicate frames, leaving one frame per chart.
        await execFileP('ffmpeg', [
            '-y', '-v', 'error',
            '-i', videoPath,
            '-vf', 'mpdecimate=hi=8000:lo=4000:frac=0.5',
            '-fps_mode', 'vfr',
            join(dir, 'frame_%02d.png'),
        ]);

        const frameFiles = (await readdir(dir)).filter(f => f.endsWith('.png')).sort();
        const frames: ChartImage[] = [];
        for (const [i, file] of frameFiles.entries()) {
            frames.push({
                url: VIDEO_URL,
                label: `Frame ${i + 1}/${frameFiles.length} (time in image, local)`,
                fileName: file,
                data: await readFile(join(dir, file)),
                // The first frame is the nearest-term chart; treat it as the
                // "current" one so it shows up in analysis-only comparisons.
                ...(i === 0 ? { forecastHours: 0 } : {}),
            });
        }
        return frames;
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}

export const meteobeSource: ChartSource = {
    id: 'meteobe',
    name: 'KMI / RMI (Belgium)',
    region: 'Europe / Belgium',
    attribution: 'KMI/RMI (Koninklijk Meteorologisch Instituut van België)',
    pageUrl: PAGE_URL,
    refreshMinutes: 60,

    async list() {
        const res = await fetch(VIDEO_URL, {
            headers: { 'user-agent': 'windy-weather-fronts (chart mirror)' },
        });
        if (!res.ok) throw new Error(`meteo.be video fetch failed: HTTP ${res.status}`);
        const video = new Uint8Array(await res.arrayBuffer());

        if (await ffmpegAvailable()) {
            const frames = await extractFrames(video);
            if (frames.length) return frames;
            console.warn('[charts:meteobe] frame extraction produced nothing, falling back to video');
        } else {
            console.warn('[charts:meteobe] ffmpeg not found, mirroring the video as-is');
        }

        return [{
            url: VIDEO_URL,
            label: 'Front animation (times in video, local)',
            fileName: 'fronts.mp4',
            mediaType: 'video',
            forecastHours: 0,
            data: video,
        }];
    },
};
