import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Refresh endpoints (server/api/refresh/**) are meant to be called by the
 * scheduled GitHub Actions workflow (.github/workflows/refresh-fronts.yml),
 * not by browsers — Vercel has no long-running process to run the interval
 * scheduler the local/Docker server uses. Requires the REFRESH_TOKEN env var
 * (set on the Vercel project) to match the x-refresh-token request header
 * (set as a GitHub Actions secret of the same value).
 */
export function requireRefreshToken(req: VercelRequest, res: VercelResponse): boolean {
    const expected = process.env.REFRESH_TOKEN;
    if (!expected) {
        console.log('REFRESH_TOKEN not set; allowing refresh without token');
        return true;
    }
    if (req.headers['x-refresh-token'] !== expected) {
        res.status(401).json({ error: 'invalid or missing x-refresh-token header' });
        return false;
    }
    return true;
}
