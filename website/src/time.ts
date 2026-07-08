/** Time formatting: local time by default, UTC when the toggle is on. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number): string => String(n).padStart(2, '0');

export function formatTime(iso: string, utc: boolean): string {
    const d = new Date(iso);
    if (utc) {
        return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} `
            + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
    }
    return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} `
        + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
