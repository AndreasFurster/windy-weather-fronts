/** All vectorized front-geometry sources, shared by the local/Docker Express
 * server (src/index.ts) and the Vercel serverless functions (api/). */

import type { FrontsSource } from '../types.ts';
import { knmiSource } from './knmi.ts';
import { wpcSource } from './wpc.ts';
import { metofficeSource } from './metoffice.ts';

export const frontsSources: FrontsSource[] = [knmiSource, wpcSource, metofficeSource];
