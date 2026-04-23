// @ts-check
/**
 * Centralised configuration — reads environment variables set in .env or the
 * process environment.  All other modules import from here so magic strings
 * and defaults live in one place.
 */

import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dirname, '..', '.env') });

/** HTTP listen port */
export const PORT = Number(process.env.PORT || 3000);

/** Twilio Account SID */
export const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';

/** Twilio Auth Token */
export const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

/** Twilio phone number (E.164) used to send SMS */
export const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';

/** Google Gemini API key */
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/** Gemini model to use */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

/**
 * Comma-separated list of E.164 phone numbers allowed to exchange SMS with Gemini.
 * Gemini will also proactively message these numbers.
 */
export const ALLOWED_NUMBERS = (process.env.ALLOWED_NUMBERS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

/**
 * How often (ms) Gemini considers sending a proactive message.
 * Default: 4 hours.
 */
export const PROACTIVE_INTERVAL_MS = Number(process.env.PROACTIVE_INTERVAL_MS || 4 * 60 * 60 * 1000);
