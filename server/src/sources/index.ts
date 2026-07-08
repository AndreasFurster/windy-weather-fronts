/** All vectorized front-geometry sources, shared by the local/Docker Express
 * server (src/index.ts) and the Vercel serverless functions (api/). */

import type { FrontsSource } from '../types.js';
import { knmiSource } from './knmi.js';
import { wpcSource } from './wpc.js';
import { metofficeSource } from './metoffice.js';

export const frontsSources: FrontsSource[] = [knmiSource, wpcSource, metofficeSource];
