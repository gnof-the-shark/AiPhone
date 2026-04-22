import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../lib/http-server.mjs';

test('POST /v1/sms/receive: returns TwiML with Gemini response', async (t) => {
  const config = {
    PORT: 0,
    API_TOKEN: 'test-token',
    CLAWPHONE_API_KEY: 'test-key',
    CLAWPHONE_API_URL: 'http://localhost:0',
    SMS_BODY_MAX_CHARS: 1600,
    IDEMPOTENCY_TTL_MS: 1000,
    GEMINI_API_KEY: 'gemini-key',
    GEMINI_MODEL: 'gemini-1.5-flash',
    ALLOWED_NUMBERS: [],
  };

  const mockGenerateGeminiResponse = async ({ prompt }) => {
    if (prompt.includes('Bonjour')) return 'Bonjour! <Comment> puis-je vous aider?';
    return 'Réponse par défaut';
  };

  const server = await createServer(config, { _generateGeminiResponse: mockGenerateGeminiResponse });
  const port = /** @type {any} */ (server.address()).port;

  t.after(() => server.close());

  const body = 'From=%2B14383389459&To=%2B14165550100&Body=Bonjour';
  const res = await fetch(`http://localhost:${port}/v1/sms/receive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'application/xml');
  const text = await res.text();
  // Verify XML escaping
  assert.ok(text.includes('<Message>Bonjour! &lt;Comment&gt; puis-je vous aider?</Message>'));
});

test('POST /v1/sms/receive: returns error message when GEMINI_API_KEY is missing', async (t) => {
  const config = {
    PORT: 0,
    API_TOKEN: 'test-token',
    CLAWPHONE_API_KEY: 'test-key',
    CLAWPHONE_API_URL: 'http://localhost:0',
    SMS_BODY_MAX_CHARS: 1600,
    IDEMPOTENCY_TTL_MS: 1000,
    GEMINI_API_KEY: '',
    GEMINI_MODEL: 'gemini-1.5-flash',
    ALLOWED_NUMBERS: [],
  };

  const server = await createServer(config);
  const port = /** @type {any} */ (server.address()).port;

  t.after(() => server.close());

  const body = 'From=%2B14383389459&To=%2B14165550100&Body=Allô';
  const res = await fetch(`http://localhost:${port}/v1/sms/receive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  assert.strictEqual(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('pas configuré'));
});

test('POST /v1/sms/receive: returns 200 with unauthorized message when number is not in allowlist', async (t) => {
  const config = {
    PORT: 0,
    API_TOKEN: 'test-token',
    CLAWPHONE_API_KEY: 'test-key',
    CLAWPHONE_API_URL: 'http://localhost:0',
    SMS_BODY_MAX_CHARS: 1600,
    IDEMPOTENCY_TTL_MS: 1000,
    GEMINI_API_KEY: 'gemini-key',
    GEMINI_MODEL: 'gemini-1.5-flash',
    ALLOWED_NUMBERS: ['+15551234567'],
  };

  const server = await createServer(config);
  const port = /** @type {any} */ (server.address()).port;

  t.after(() => server.close());

  const body = 'From=%2B14383389459&To=%2B14165550100&Body=Bonjour';
  const res = await fetch(`http://localhost:${port}/v1/sms/receive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  assert.strictEqual(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('pas autorisé'));
});
