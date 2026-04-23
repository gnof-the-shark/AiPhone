// @ts-check
/**
 * Centralised configuration.
 * All env vars live here; other modules import from here.
 */

import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dirname, '..', '.env') });

/** HTTP listen port */
export const PORT = Number(process.env.PORT || 3000);

/** ADB device serial of the Android emulator (default: first emulator) */
export const ADB_DEVICE = process.env.ADB_DEVICE || 'emulator-5554';

/** Path to the adb binary (default: 'adb' — assumes it is in PATH) */
export const ADB_PATH = process.env.ADB_PATH || 'adb';

/** Google Gemini API key */
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/** Gemini model to use */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

/**
 * Comma-separated E.164 phone numbers that are allowed to exchange SMS with
 * Gemini.  Gemini will also proactively message these numbers.
 */
export const ALLOWED_NUMBERS = (process.env.ALLOWED_NUMBERS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

/**
 * How often (ms) the server polls Fongo notifications for new incoming SMS.
 * Default: 5 seconds.
 */
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5_000);

/**
 * How often (ms) Gemini considers sending a proactive message.
 * Default: 4 hours.
 */
export const PROACTIVE_INTERVAL_MS = Number(
  process.env.PROACTIVE_INTERVAL_MS || 4 * 60 * 60 * 1000,
);
