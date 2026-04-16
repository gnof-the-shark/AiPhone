// @ts-check
/**
 * AiPhone HTTP server.
 *
 * Exposes a single outbound-SMS endpoint on top of the ClawPhone API so that
 * AI agents can send SMS from their provisioned Canadian number without any
 * paid third-party service.
 *
 * Routes
 * ──────
 *   GET  /health                        – liveness probe
 *   POST /v1/numbers/:number/sms        – send an outbound SMS
 *
 * Authentication
 * ──────────────
 *   All /v1/* routes require `Authorization: Bearer <CLAWPHONE_API_KEY>`.
 *   The same key the agent already holds from ClawPhone registration.
 */

import http from 'node:http';
import { URL } from 'node:url';

import { sendOutboundSms } from './send-sms.mjs';
import { createClawPhoneClient } from './clawphone-client.mjs';
import { checkIdempotency, saveIdempotency, evictExpiredIdempotencyEntries } from './idempotency.mjs';
import { readBody, sendJson, createLogger } from './utils.mjs';

const log = createLogger('server');

/**
 * @typedef {object} ServerConfig
 * @property {number}  PORT
 * @property {string}  API_TOKEN
 * @property {string}  CLAWPHONE_API_KEY
 * @property {string}  CLAWPHONE_API_URL
 * @property {number}  SMS_BODY_MAX_CHARS
 * @property {number}  IDEMPOTENCY_TTL_MS
 */

/**
 * Create and start the AiPhone HTTP server.
 *
 * @param {ServerConfig}  config
 * @param {object}        [_deps]              – injectable overrides for testing
 * @param {Function}      [_deps._request]     – override HTTP request function in clawphone-client
 * @returns {Promise<http.Server>}
 */
export async function createServer(config, { _request } = {}) {
  const {
    PORT,
    API_TOKEN,
    CLAWPHONE_API_KEY,
    CLAWPHONE_API_URL,
    SMS_BODY_MAX_CHARS,
    IDEMPOTENCY_TTL_MS,
  } = config;

  // Build ClawPhone client — _request lets tests intercept outbound HTTP calls.
  const clawphoneClient = CLAWPHONE_API_KEY
    ? createClawPhoneClient({ apiKey: CLAWPHONE_API_KEY, apiUrl: CLAWPHONE_API_URL, _request })
    : null;

  // ── Authentication helper ────────────────────────────────────────────────

  /**
   * Returns true if the request carries a valid bearer token.
   * When API_TOKEN is empty any non-empty token is accepted (dev mode).
   * @param {http.IncomingMessage} req
   */
  function isAuthorized(req) {
    const header = req.headers['authorization'] ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return false;
    if (API_TOKEN) return token === API_TOKEN;
    return token.length > 0; // dev mode: any non-empty token
  }

  // ── Request handler ──────────────────────────────────────────────────────

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', `http://${req.headers.host}`);

    // ── Health check ───────────────────────────────────────────────────────
    if (req.method === 'GET' && u.pathname === '/health') {
      sendJson(res, 200, { ok: true, clawphoneConfigured: clawphoneClient !== null });
      return;
    }

    // ── POST /v1/numbers/:number/sms ───────────────────────────────────────
    const smsMatch = u.pathname.match(/^\/v1\/numbers\/([^/]+)\/sms$/);
    if (req.method === 'POST' && smsMatch) {
      // Auth
      if (!isAuthorized(req)) {
        sendJson(res, 401, { error: 'Authorization: Bearer <CLAWPHONE_API_KEY> required' });
        return;
      }

      // ClawPhone client must be configured
      if (!clawphoneClient) {
        sendJson(res, 503, { error: 'CLAWPHONE_API_KEY is not configured on this server' });
        return;
      }

      // Parse body
      let parsed;
      try {
        const raw = await readBody(req);
        parsed = JSON.parse(raw);
      } catch (err) {
        const statusCode = /** @type {any} */ (err).statusCode ?? 400;
        sendJson(res, statusCode, { error: String(err) });
        return;
      }

      const from = decodeURIComponent(smsMatch[1]);
      const idempotencyKey = req.headers['idempotency-key']
        ? String(req.headers['idempotency-key'])
        : null;

      const outcome = await sendOutboundSms({
        from,
        to:   String(parsed?.to   ?? ''),
        body: String(parsed?.body ?? ''),
        idempotencyKey,
        deps: {
          clawphoneSendSms: clawphoneClient.sendSms,
          checkIdempotency,
          saveIdempotency,
        },
        config: { smsBodyMaxChars: SMS_BODY_MAX_CHARS, idempotencyTtlMs: IDEMPOTENCY_TTL_MS },
        log:   (msg) => log.log(msg),
        error: (msg) => log.error(msg),
      });

      if (!outcome.ok) {
        sendJson(res, outcome.statusCode, { error: outcome.error });
        return;
      }

      sendJson(res, 201, outcome.result);
      return;
    }

    // ── 404 ────────────────────────────────────────────────────────────────
    sendJson(res, 404, { error: 'Not found' });
  });

  // Periodically evict expired idempotency entries (every hour).
  setInterval(evictExpiredIdempotencyEntries, 3_600_000).unref();

  await new Promise((resolve) => {
    server.listen(PORT, () => {
      log.log('listening', { url: `http://localhost:${PORT}` });
      log.log('endpoint', { url: `http://localhost:${PORT}/v1/numbers/<your-number>/sms` });
      if (!CLAWPHONE_API_KEY) {
        log.warn('CLAWPHONE_API_KEY is not set — SMS sending is disabled');
      }
      resolve(undefined);
    });
  });

  return server;
}
