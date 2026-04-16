// @ts-check
/**
 * HTTP client for the ClawPhone REST API.
 *
 * AiPhone uses this to forward outbound SMS requests to ClawPhone, which
 * handles actual delivery using your provisioned Canadian number — at no
 * extra cost beyond the free ClawPhone account.
 *
 * Uses Node's built-in `node:https` so there are zero paid dependencies.
 */

import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

/**
 * @typedef {object} ClawPhoneSendResult
 * @property {string}      message_id   – ClawPhone message ID
 * @property {string}      from         – Sender number (your ClawPhone number)
 * @property {string}      to           – Destination number
 * @property {string}      body         – Message text
 * @property {string}      status       – e.g. "queued" | "sent"
 * @property {string}      created_at   – ISO 8601
 */

/**
 * Make a JSON request to any URL using the built-in http/https module.
 * Returns `{ statusCode, body }` where body is the parsed JSON (or raw text on
 * parse error).
 *
 * @param {{ url: string, method: string, headers: Record<string,string>, body?: unknown }} opts
 * @returns {Promise<{ statusCode: number, body: unknown }>}
 */
function jsonRequest({ url, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const reqHeaders = {
      ...headers,
      'content-type': 'application/json',
      'accept': 'application/json',
      ...(payload ? { 'content-length': String(Buffer.byteLength(payload)) } : {}),
    };

    const req = transport.request(
      { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method, headers: reqHeaders },
      (res) => {
        const chunks = /** @type {Buffer[]} */ ([]);
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed;
          try { parsed = JSON.parse(text); } catch { parsed = text; }
          resolve({ statusCode: res.statusCode ?? 0, body: parsed });
        });
        res.on('error', reject);
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Create a ClawPhone API client.
 *
 * @param {{ apiKey: string, apiUrl: string, _request?: typeof jsonRequest }} opts
 * @returns {{ sendSms: (opts: { from: string, to: string, body: string }) => Promise<ClawPhoneSendResult> }}
 */
export function createClawPhoneClient({ apiKey, apiUrl, _request = jsonRequest }) {
  if (!apiKey) throw new Error('CLAWPHONE_API_KEY is required');

  /**
   * Send an outbound SMS via ClawPhone.
   * Calls POST /v1/numbers/:from/sms on the ClawPhone API.
   *
   * @param {{ from: string, to: string, body: string }} params
   * @returns {Promise<ClawPhoneSendResult>}
   */
  async function sendSms({ from, to, body }) {
    const url = `${apiUrl.replace(/\/$/, '')}/numbers/${encodeURIComponent(from)}/sms`;

    const { statusCode, body: responseBody } = await _request({
      url,
      method: 'POST',
      headers: { 'authorization': `Bearer ${apiKey}` },
      body: { to, body },
    });

    if (statusCode >= 200 && statusCode < 300) {
      return /** @type {ClawPhoneSendResult} */ (responseBody);
    }

    const detail = typeof responseBody === 'object' && responseBody !== null
      ? (/** @type {any} */ (responseBody).error ?? JSON.stringify(responseBody))
      : String(responseBody);
    throw new Error(`ClawPhone API error ${statusCode}: ${detail}`);
  }

  return { sendSms };
}
