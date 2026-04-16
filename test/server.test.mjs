// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import { createServer } from '../lib/http-server.mjs';
import { clearIdempotencyStore } from '../lib/idempotency.mjs';

const CANADIAN_FROM = '+14165550100';
const VALID_TO      = '+15551234567';

/** Minimal config — no real ClawPhone calls. */
const BASE_CONFIG = {
  PORT:               0,          // OS picks a free port
  API_TOKEN:          'test-tok',
  CLAWPHONE_API_KEY:  'cp-test-key',
  CLAWPHONE_API_URL:  'https://api.clawphone.me/v1',
  SMS_BODY_MAX_CHARS: 1600,
  IDEMPOTENCY_TTL_MS: 60_000,
};

/**
 * Starts a test server whose outbound HTTP calls are intercepted by `_request`.
 * Returns `{ server, url, close }`.
 */
async function startServer(config = BASE_CONFIG, _request = undefined) {
  const server = await createServer(config, { _request });
  const { port } = /** @type {any} */ (server.address());
  return {
    server,
    url: `http://localhost:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

/**
 * Convenience wrapper around fetch that sets common headers.
 */
async function post(url, body, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

test.beforeEach(() => clearIdempotencyStore());

// ── /health ──────────────────────────────────────────────────────────────────

test('GET /health returns 200 with clawphoneConfigured=true', async () => {
  const { url, close } = await startServer();
  try {
    const res = await fetch(`${url}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.clawphoneConfigured, true);
  } finally { await close(); }
});

test('GET /health returns clawphoneConfigured=false when key missing', async () => {
  const { url, close } = await startServer({ ...BASE_CONFIG, CLAWPHONE_API_KEY: '' });
  try {
    const res = await fetch(`${url}/health`);
    const body = await res.json();
    assert.equal(body.clawphoneConfigured, false);
  } finally { await close(); }
});

// ── Authentication ───────────────────────────────────────────────────────────

test('POST /v1/numbers/:n/sms returns 401 when Authorization header is missing', async () => {
  const { url, close } = await startServer();
  try {
    const res = await fetch(`${url}/v1/numbers/${CANADIAN_FROM}/sms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: VALID_TO, body: 'hi' }),
    });
    assert.equal(res.status, 401);
  } finally { await close(); }
});

test('POST /v1/numbers/:n/sms returns 401 for wrong token', async () => {
  const { url, close } = await startServer();
  try {
    const res = await post(
      `${url}/v1/numbers/${CANADIAN_FROM}/sms`,
      { to: VALID_TO, body: 'hi' },
      { authorization: 'Bearer wrong-token' },
    );
    assert.equal(res.status, 401);
  } finally { await close(); }
});

// ── 503 when ClawPhone key not configured ────────────────────────────────────

test('POST /v1/numbers/:n/sms returns 503 when CLAWPHONE_API_KEY not set', async () => {
  const { url, close } = await startServer({ ...BASE_CONFIG, CLAWPHONE_API_KEY: '', API_TOKEN: '' });
  try {
    const res = await post(
      `${url}/v1/numbers/${CANADIAN_FROM}/sms`,
      { to: VALID_TO, body: 'hi' },
      { authorization: 'Bearer any-token' },
    );
    assert.equal(res.status, 503);
  } finally { await close(); }
});

// ── Input validation ─────────────────────────────────────────────────────────

test('POST /v1/numbers/:n/sms returns 422 for non-Canadian from number', async () => {
  const mockRequest = async () => ({ statusCode: 201, body: {} });
  const { url, close } = await startServer(BASE_CONFIG, mockRequest);
  try {
    const res = await post(
      `${url}/v1/numbers/+33612345678/sms`,
      { to: VALID_TO, body: 'hi' },
      { authorization: 'Bearer test-tok' },
    );
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.match(body.error, /Canadian/);
  } finally { await close(); }
});

test('POST /v1/numbers/:n/sms returns 422 for invalid to number', async () => {
  const mockRequest = async () => ({ statusCode: 201, body: {} });
  const { url, close } = await startServer(BASE_CONFIG, mockRequest);
  try {
    const res = await post(
      `${url}/v1/numbers/${encodeURIComponent(CANADIAN_FROM)}/sms`,
      { to: 'bad-number', body: 'hi' },
      { authorization: 'Bearer test-tok' },
    );
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.match(body.error, /E\.164/);
  } finally { await close(); }
});

test('POST /v1/numbers/:n/sms returns 422 for empty body', async () => {
  const mockRequest = async () => ({ statusCode: 201, body: {} });
  const { url, close } = await startServer(BASE_CONFIG, mockRequest);
  try {
    const res = await post(
      `${url}/v1/numbers/${encodeURIComponent(CANADIAN_FROM)}/sms`,
      { to: VALID_TO, body: '   ' },
      { authorization: 'Bearer test-tok' },
    );
    assert.equal(res.status, 422);
  } finally { await close(); }
});

// ── Happy path ───────────────────────────────────────────────────────────────

test('POST /v1/numbers/:n/sms returns 201 on successful send', async () => {
  const mockRequest = async ({ url, body }) => {
    assert.match(url, /clawphone\.me/);
    assert.match(url, /14165550100/);
    return {
      statusCode: 201,
      body: { message_id: 'cp_123', status: 'sent', to: body.to, from: CANADIAN_FROM, body: body.body, created_at: new Date().toISOString() },
    };
  };
  const { url, close } = await startServer(BASE_CONFIG, mockRequest);
  try {
    const res = await post(
      `${url}/v1/numbers/${encodeURIComponent(CANADIAN_FROM)}/sms`,
      { to: VALID_TO, body: 'Bonjour!' },
      { authorization: 'Bearer test-tok' },
    );
    assert.equal(res.status, 201);
    const result = await res.json();
    assert.equal(result.from,   CANADIAN_FROM);
    assert.equal(result.to,     VALID_TO);
    assert.equal(result.body,   'Bonjour!');
    assert.equal(result.status, 'sent');
    assert.ok(result.message_id);
    assert.ok(result.created_at);
  } finally { await close(); }
});

// ── Idempotency ──────────────────────────────────────────────────────────────

test('Idempotency-Key deduplicates identical requests', async () => {
  let calls = 0;
  const mockRequest = async () => {
    calls++;
    return { statusCode: 201, body: { message_id: 'cp_idem', status: 'sent' } };
  };
  const { url, close } = await startServer(BASE_CONFIG, mockRequest);
  try {
    const headers = { authorization: 'Bearer test-tok', 'idempotency-key': 'idem-key-1' };
    const payload = { to: VALID_TO, body: 'once' };

    const r1 = await post(`${url}/v1/numbers/${encodeURIComponent(CANADIAN_FROM)}/sms`, payload, headers);
    const r2 = await post(`${url}/v1/numbers/${encodeURIComponent(CANADIAN_FROM)}/sms`, payload, headers);

    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.equal(calls, 1); // ClawPhone called only once

    const b1 = await r1.json();
    const b2 = await r2.json();
    assert.equal(b1.message_id, b2.message_id);
  } finally { await close(); }
});

// ── Provider error ───────────────────────────────────────────────────────────

test('POST /v1/numbers/:n/sms returns 502 when ClawPhone returns an error', async () => {
  const mockRequest = async () => ({
    statusCode: 500,
    body: { error: 'Internal server error' },
  });
  const { url, close } = await startServer(BASE_CONFIG, mockRequest);
  try {
    const res = await post(
      `${url}/v1/numbers/${encodeURIComponent(CANADIAN_FROM)}/sms`,
      { to: VALID_TO, body: 'hello' },
      { authorization: 'Bearer test-tok' },
    );
    assert.equal(res.status, 502);
  } finally { await close(); }
});

// ── 404 ──────────────────────────────────────────────────────────────────────

test('Unknown route returns 404', async () => {
  const { url, close } = await startServer();
  try {
    const res = await fetch(`${url}/unknown`);
    assert.equal(res.status, 404);
  } finally { await close(); }
});
