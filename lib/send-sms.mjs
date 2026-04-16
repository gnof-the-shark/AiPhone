// @ts-check
/**
 * Core outbound SMS logic — pure business rules with no HTTP or global-state
 * dependencies.  All external calls are injected via `deps` so this module
 * is fully unit-testable without any network access.
 */

import { randomUUID } from 'node:crypto';
import { isE164, isCanadianE164 } from './utils.mjs';

/**
 * @typedef {object} SendSmsOptions
 * @property {string}        from            – Canadian E.164 ClawPhone number (e.g. +14165550100)
 * @property {string}        to              – E.164 destination number
 * @property {string}        body            – SMS text (1–smsBodyMaxChars chars)
 * @property {string|null}   idempotencyKey  – Value of Idempotency-Key header, or null
 * @property {SendSmsDeps}   deps
 * @property {SendSmsConfig} config
 * @property {Function}      [log]
 * @property {Function}      [error]
 */

/**
 * @typedef {object} SendSmsDeps
 * @property {(opts: { from: string, to: string, body: string }) => Promise<unknown>} clawphoneSendSms
 * @property {(key: string) => unknown|null}                          checkIdempotency
 * @property {(key: string, response: unknown, ttl: number) => void}  saveIdempotency
 */

/**
 * @typedef {object} SendSmsConfig
 * @property {number} smsBodyMaxChars
 * @property {number} idempotencyTtlMs
 */

/**
 * @typedef {object} SendSmsResult
 * @property {string}      message_id    – AiPhone-generated UUID for this send
 * @property {string}      from          – Sender (your ClawPhone Canadian number)
 * @property {string}      to            – Destination number
 * @property {string}      body          – Message text as sent
 * @property {string}      status        – "sent"
 * @property {unknown}     provider      – Raw response body from ClawPhone API
 * @property {string}      created_at    – ISO 8601 timestamp
 */

/**
 * Validate inputs and send an outbound SMS via ClawPhone.
 *
 * @param {SendSmsOptions} opts
 * @returns {Promise<{ ok: true, result: SendSmsResult } | { ok: false, statusCode: number, error: string }>}
 */
export async function sendOutboundSms({
  from,
  to,
  body,
  idempotencyKey,
  deps,
  config,
  log   = () => {},
  error = (msg) => console.error(msg),
}) {
  // ── Validate `from` ──────────────────────────────────────────────────────
  if (!isCanadianE164(from)) {
    return {
      ok: false,
      statusCode: 422,
      error: `'from' must be a Canadian E.164 number (e.g. +14165550100). Got: ${from}`,
    };
  }

  // ── Validate `to` ────────────────────────────────────────────────────────
  if (!isE164(to)) {
    return {
      ok: false,
      statusCode: 422,
      error: `'to' must be a valid E.164 phone number (e.g. +15551234567). Got: ${to}`,
    };
  }

  // ── Validate `body` ──────────────────────────────────────────────────────
  const trimmedBody = String(body ?? '').trim();
  if (!trimmedBody) {
    return { ok: false, statusCode: 422, error: "'body' must not be empty" };
  }
  if (trimmedBody.length > config.smsBodyMaxChars) {
    return {
      ok: false,
      statusCode: 422,
      error: `'body' exceeds maximum length of ${config.smsBodyMaxChars} characters`,
    };
  }

  // ── Idempotency check ────────────────────────────────────────────────────
  if (idempotencyKey) {
    const cached = deps.checkIdempotency(idempotencyKey);
    if (cached !== null) {
      log(`idempotent replay key=${idempotencyKey}`);
      return { ok: true, result: /** @type {SendSmsResult} */ (cached) };
    }
  }

  // ── Build record ─────────────────────────────────────────────────────────
  const messageId = randomUUID();
  const createdAt = new Date().toISOString();

  log(`sending message_id=${messageId} from=${from} to=${to} chars=${trimmedBody.length}`);

  // ── Call ClawPhone API ────────────────────────────────────────────────────
  let providerResponse;
  try {
    providerResponse = await deps.clawphoneSendSms({ from, to, body: trimmedBody });
    log(`sent message_id=${messageId}`);
  } catch (err) {
    error(`ClawPhone error message_id=${messageId}: ${String(err)}`);
    return {
      ok: false,
      statusCode: 502,
      error: `ClawPhone API error: ${String(err)}`,
    };
  }

  /** @type {SendSmsResult} */
  const result = {
    message_id: messageId,
    from,
    to,
    body: trimmedBody,
    status: 'sent',
    provider: providerResponse,
    created_at: createdAt,
  };

  // ── Cache for idempotency ────────────────────────────────────────────────
  if (idempotencyKey) {
    deps.saveIdempotency(idempotencyKey, result, config.idempotencyTtlMs);
  }

  return { ok: true, result };
}
