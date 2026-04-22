// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import { createServer } from '../lib/http-server.mjs';

const CANADIAN_NUMBER = '+14165550100';
const USER_NUMBER     = '+14383389459';

const BASE_CONFIG = {
  PORT:               0,
  API_TOKEN:          'test-tok',
  CLAWPHONE_API_KEY:  'cp-test-key',
  CLAWPHONE_API_URL:  'https://api.clawphone.me/v1',
  SMS_BODY_MAX_CHARS: 1600,
  IDEMPOTENCY_TTL_MS: 60_000,
  GEMINI_API_KEY:     'gemini-key',
  ALLOWED_NUMBERS:    [USER_NUMBER],
};

async function startServer(config = BASE_CONFIG, _request = undefined) {
  const server = await createServer(config, { _request });
  const { port } = /** @type {any} */ (server.address());
  return {
    server,
    url: `http://localhost:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

test('POST /v1/webhooks/clawphone responds with 200 and eventually calls Gemini and ClawPhone', async (t) => {
  let clawphoneCalled = false;
  let sentBody = '';

  const mockRequest = async ({ url, body }) => {
    if (url.includes('clawphone.me')) {
      clawphoneCalled = true;
      sentBody = body.body;
      return { statusCode: 201, body: { status: 'sent' } };
    }
    return { statusCode: 200, body: {} };
  };

  const { url, close } = await startServer(BASE_CONFIG, mockRequest);

  try {
    const res = await fetch(`${url}/v1/webhooks/clawphone`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from: USER_NUMBER,
        to: CANADIAN_NUMBER,
        body: 'Bonjour Gemini'
      }),
    });

    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.ok, true);

    // Wait for async processing
    let attempts = 0;
    while (!clawphoneCalled && attempts < 20) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    assert.ok(clawphoneCalled, 'ClawPhone API should have been called');
    // Note: Since we didn't mock Gemini specifically in the server (it's created internally),
    // we just check if a reply was sent. In real tests we might want to inject a mock gemini client.
  } finally {
    await close();
  }
});

test('POST /v1/webhooks/voice returns initial TwiML', async () => {
  const { url, close } = await startServer(BASE_CONFIG);
  try {
    const res = await fetch(`${url}/v1/webhooks/voice`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/xml');
    const text = await res.text();
    assert.match(text, /<Gather/);
    assert.match(text, /assistant I A/);
  } finally {
    await close();
  }
});

test('POST /v1/webhooks/voice/speech returns Gemini response in TwiML', async () => {
  const { url, close } = await startServer(BASE_CONFIG);
  try {
    const res = await fetch(`${url}/v1/webhooks/voice/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ SpeechResult: 'Quoi de neuf ?' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/xml');
    const text = await res.text();
    assert.match(text, /<Say/);
    assert.match(text, /<Gather/);
  } finally {
    await close();
  }
});

test('POST /v1/webhooks/clawphone rejects unauthorized numbers', async () => {
  const { url, close } = await startServer(BASE_CONFIG);
  try {
    const res = await fetch(`${url}/v1/webhooks/clawphone`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from: '+15140000000',
        to: CANADIAN_NUMBER,
        body: 'Hello'
      }),
    });

    assert.equal(res.status, 403);
  } finally {
    await close();
  }
});

test('POST /v1/webhooks/clawphone handles form-urlencoded data', async () => {
  let clawphoneCalled = false;
  const mockRequest = async () => {
    clawphoneCalled = true;
    return { statusCode: 201, body: { status: 'sent' } };
  };

  const { url, close } = await startServer(BASE_CONFIG, mockRequest);

  try {
    const params = new URLSearchParams();
    params.append('From', USER_NUMBER);
    params.append('To', CANADIAN_NUMBER);
    params.append('Body', 'Hello from form');

    const res = await fetch(`${url}/v1/webhooks/clawphone`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    assert.equal(res.status, 200);

    let attempts = 0;
    while (!clawphoneCalled && attempts < 20) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }
    assert.ok(clawphoneCalled);
  } finally {
    await close();
  }
});
