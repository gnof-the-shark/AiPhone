// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import { createServer } from '../lib/http-server.mjs';
import { clearHistory } from '../lib/conversation.mjs';

const ALLOWED = '+14383389459';

/** Minimal config — no real Twilio or Gemini calls. */
const BASE_CONFIG = {
  PORT:                 0,      // OS picks a free port
  TWILIO_ACCOUNT_SID:  '',
  TWILIO_AUTH_TOKEN:   '',
  TWILIO_PHONE_NUMBER: '+15550001111',
  GEMINI_API_KEY:      '',
  GEMINI_MODEL:        'gemini-1.5-flash',
  ALLOWED_NUMBERS:     [ALLOWED],
  PROACTIVE_INTERVAL_MS: 86_400_000, // 24 h — won't fire during tests
};

/**
 * Start a test server with optional dep overrides.
 * Returns { url, close }.
 */
async function startServer(cfg = BASE_CONFIG, deps = {}) {
  const server = await createServer(cfg, deps);
  const { port } = /** @type {any} */ (server.address());
  return {
    server,
    url: `http://localhost:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

/** Build a Twilio-style form body */
function twilioForm(from, body) {
  return new URLSearchParams({ From: from, To: '+15550001111', Body: body }).toString();
}

test.beforeEach(() => clearHistory());

// ── GET /health ───────────────────────────────────────────────────────────────

test('GET /health returns 200', async () => {
  const { url, close } = await startServer();
  try {
    const res = await fetch(`${url}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.twilioConfigured, false);
    assert.equal(body.geminiConfigured, false);
    assert.equal(body.schedulerActive, false);
  } finally { await close(); }
});

test('GET /health reports twilioConfigured=true when credentials set', async () => {
  const cfg = { ...BASE_CONFIG, TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_PHONE_NUMBER: '+15550001111' };
  const { url, close } = await startServer(cfg);
  try {
    const body = await fetch(`${url}/health`).then(r => r.json());
    assert.equal(body.twilioConfigured, true);
  } finally { await close(); }
});

test('GET /health reports schedulerActive=true when all credentials set', async () => {
  const cfg = {
    ...BASE_CONFIG,
    TWILIO_ACCOUNT_SID:  'AC1',
    TWILIO_AUTH_TOKEN:   'tok',
    TWILIO_PHONE_NUMBER: '+15550001111',
    GEMINI_API_KEY:      'gk1',
  };
  const mockProactive = async () => null; // always PASS
  const { url, close } = await startServer(cfg, { generateProactive: mockProactive, sendSms: async () => {} });
  try {
    const body = await fetch(`${url}/health`).then(r => r.json());
    assert.equal(body.schedulerActive, true);
  } finally { await close(); }
});

// ── POST /sms/incoming ────────────────────────────────────────────────────────

test('POST /sms/incoming replies with TwiML when Gemini responds', async () => {
  const mockChat = async () => 'Bonjour!';
  const cfg = { ...BASE_CONFIG, GEMINI_API_KEY: 'gk1' };
  const { url, close } = await startServer(cfg, { chat: mockChat });
  try {
    const res = await fetch(`${url}/sms/incoming`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: twilioForm(ALLOWED, 'Salut'),
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /Bonjour!/);
    assert.match(text, /<Response>/);
  } finally { await close(); }
});

test('POST /sms/incoming escapes XML in Gemini reply', async () => {
  const mockChat = async () => 'Hi <there> & "you"';
  const cfg = { ...BASE_CONFIG, GEMINI_API_KEY: 'gk1' };
  const { url, close } = await startServer(cfg, { chat: mockChat });
  try {
    const res = await fetch(`${url}/sms/incoming`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: twilioForm(ALLOWED, 'hello'),
    });
    const text = await res.text();
    assert.match(text, /&lt;there&gt;/);
    assert.match(text, /&amp;/);
    assert.match(text, /&quot;/);
  } finally { await close(); }
});

test('POST /sms/incoming rejects unauthorized number', async () => {
  const { url, close } = await startServer({ ...BASE_CONFIG, GEMINI_API_KEY: 'gk1' });
  try {
    const res = await fetch(`${url}/sms/incoming`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: twilioForm('+19999999999', 'hi'),
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /autorisé/);
  } finally { await close(); }
});

test('POST /sms/incoming returns error TwiML when GEMINI_API_KEY not set', async () => {
  const { url, close } = await startServer();
  try {
    const res = await fetch(`${url}/sms/incoming`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: twilioForm(ALLOWED, 'hi'),
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /configuré/);
  } finally { await close(); }
});

test('POST /sms/incoming returns 400 for missing fields', async () => {
  const { url, close } = await startServer();
  try {
    const res = await fetch(`${url}/sms/incoming`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'From=%2B14383389459', // no Body
    });
    assert.equal(res.status, 400);
  } finally { await close(); }
});

test('POST /sms/incoming returns error TwiML when Gemini throws', async () => {
  const mockChat = async () => { throw new Error('gemini down'); };
  const cfg = { ...BASE_CONFIG, GEMINI_API_KEY: 'gk1' };
  const { url, close } = await startServer(cfg, { chat: mockChat });
  try {
    const res = await fetch(`${url}/sms/incoming`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: twilioForm(ALLOWED, 'hi'),
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /erreur/);
  } finally { await close(); }
});

// ── Conversation history ──────────────────────────────────────────────────────

test('Conversation history accumulates across requests', async () => {
  const received = [];
  const mockChat = async ({ history, userMessage }) => {
    received.push({ historyLength: history.length, userMessage });
    return 'ok';
  };
  const cfg = { ...BASE_CONFIG, GEMINI_API_KEY: 'gk1' };
  const { url, close } = await startServer(cfg, { chat: mockChat });
  try {
    const opts = {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    };
    await fetch(`${url}/sms/incoming`, { ...opts, body: twilioForm(ALLOWED, 'first') });
    await fetch(`${url}/sms/incoming`, { ...opts, body: twilioForm(ALLOWED, 'second') });

    assert.equal(received[0].historyLength, 0);   // no history on first message
    assert.equal(received[1].historyLength, 2);   // user + model from first exchange
    assert.equal(received[1].userMessage, 'second');
  } finally { await close(); }
});

// ── 404 ───────────────────────────────────────────────────────────────────────

test('Unknown route returns 404', async () => {
  const { url, close } = await startServer();
  try {
    const res = await fetch(`${url}/unknown`);
    assert.equal(res.status, 404);
  } finally { await close(); }
});
