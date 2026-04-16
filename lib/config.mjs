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
 * Bearer token that callers (AI agents) must supply in `Authorization: Bearer <token>`.
 * Defaults to CLAWPHONE_API_KEY so agents reuse the same key they already have.
 * When both are empty the server still requires the header but accepts any value
 * (development / local testing only — always set this in production).
 */
export const API_TOKEN = process.env.API_TOKEN || process.env.CLAWPHONE_API_KEY || "";

/**
 * ClawPhone API key used to authenticate outbound SMS requests.
 * Same value the agent obtained from POST /v1/auth/register/verify.
 */
export const CLAWPHONE_API_KEY = process.env.CLAWPHONE_API_KEY || "";

/**
 * Base URL of the ClawPhone REST API.
 * Override in tests or if you self-host the ClawPhone gateway.
 */
export const CLAWPHONE_API_URL = process.env.CLAWPHONE_API_URL || "https://api.clawphone.me/v1";

/**
 * Default country for number provisioning — "CA" for free Canadian numbers.
 */
export const DEFAULT_COUNTRY = "CA";

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
