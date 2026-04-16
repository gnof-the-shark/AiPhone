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

/**
 * Bearer token that callers must supply in `Authorization: Bearer <token>`.
 * When empty (dev/test) the header is still required but any non-empty value
 * is accepted.
 */
export const API_TOKEN = process.env.API_TOKEN || "";

/** Twilio credentials – required for actual SMS delivery */
export const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
export const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN  || "";

/**
 * Maximum SMS body length accepted by the API.
 * 1600 characters = 10 concatenated GSM-7 segments, a generous but finite cap.
 */
export const SMS_BODY_MAX_CHARS = Number(process.env.SMS_BODY_MAX_CHARS || 1600);

/**
 * How long (ms) idempotency keys are remembered.
 * Requests that reuse the same key within this window return the cached
 * response instead of sending a second SMS.
 */
export const IDEMPOTENCY_TTL_MS = Number(process.env.IDEMPOTENCY_TTL_MS || 86_400_000); // 24 h
