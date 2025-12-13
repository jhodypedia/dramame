// config/index.js
import dotenv from 'dotenv';

dotenv.config();

export const PORT = process.env.PORT || 4000;

/**
 * Dramabox API
 */
export const DRAMABOX_BASE_URL =
  process.env.DRAMABOX_BASE_URL || 'https://sementara.site';

export const DRAMABOX_LANG =
  process.env.DRAMABOX_LANG || 'in';

export const DRAMABOX_TOKEN =
  process.env.DRAMABOX_TOKEN || '';

/**
 * Adsterra
 */
export const ADSTERRA_DIRECTLINK =
  process.env.ADSTERRA_DIRECTLINK || '';

export const ADSTERRA_FREQ =
  Number(process.env.ADSTERRA_FREQ || '5');
