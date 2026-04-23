// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import { createServer } from '../lib/http-server.mjs';
import { clearHistory } from '../lib/conversation.mjs';

const ALLOWED = '+14383389459';

/** Minimal config — won't actually poll (interval too long) */
const BASE_CONFIG = {
  PORT:                 0,
  ADB_DEVICE:           'emulator-5554',
  ADB_PATH:             'adb',
  GEMINI_API_KEY:       '',
  GEMINI_MODEL:         'gemini-1.5-flash',
  ALLOWED_NUMBERS:      [ALLOWED],
  POLL_INTERVAL_MS:     86_400_000,
  PROACTIVE_INTERVAL_MS: 86_400_000,
};

/** Silent bridge stub — emulator is offline, no messages */
const SILENT_BRIDGE = {
  getNewMessages: async () => [],
  sendMessage:    async () => {},
  isReady:        async () => false,
};

async function startServer(cfg = BASE_CONFIG, deps = {}) {
  const server = await createServer(cfg, { bridge: SILENT_BRIDGE, ...deps });
  const { port } = /** @type {any} */ (server.address());
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

test.beforeEach(() => clearHistory());

// ── GET /health ───────────────────────────────────────────────────────────────

test('GET /health returns 200 with correct structure', async () => {
  const { url, close } = await startServer();
  try {
    const res  = await fetch(`${url}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok,               true);
    assert.equal(body.bridgeReady,      false);
    assert.equal(body.geminiConfigured, false);
    assert.equal(body.schedulerActive,  false);
  } finally { await close(); }
});

test('GET /health reports geminiConfigured=true when key is set', async () => {
  const { url, close } = await startServer({ ...BASE_CONFIG, GEMINI_API_KEY: 'gk1' });
  try {
    const body = await fetch(`${url}/health`).then((r) => r.json());
    assert.equal(body.geminiConfigured, true);
  } finally { await close(); }
});

test('GET /health reports bridgeReady=true when emulator is up', async () => {
  const readyBridge = { ...SILENT_BRIDGE, isReady: async () => true };
  const { url, close } = await startServer(BASE_CONFIG, { bridge: readyBridge });
  try {
    const body = await fetch(`${url}/health`).then((r) => r.json());
    assert.equal(body.bridgeReady, true);
  } finally { await close(); }
});

test('GET /health reports schedulerActive=true when Gemini is configured', async () => {
  const { url, close } = await startServer({ ...BASE_CONFIG, GEMINI_API_KEY: 'gk1' });
  try {
    const body = await fetch(`${url}/health`).then((r) => r.json());
    assert.equal(body.schedulerActive, true);
  } finally { await close(); }
});

// ── SMS polling ───────────────────────────────────────────────────────────────

test('Polling sends Gemini reply when a new message arrives', async () => {
  let sentTo = null;
  let sentBody = null;
  let pollCalls = 0;

  const bridge = {
    getNewMessages: async () => {
      pollCalls++;
      return pollCalls === 1 ? [{ from: ALLOWED, body: 'Salut Gemini!' }] : [];
    },
    sendMessage: async (to, body) => { sentTo = to; sentBody = body; },
    isReady: async () => true,
  };

  const server = await createServer(
    { ...BASE_CONFIG, GEMINI_API_KEY: 'gk1', POLL_INTERVAL_MS: 30 },
    { bridge, chat: async () => 'Bonjour!' },
  );
  try {
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(sentTo,   ALLOWED);
    assert.equal(sentBody, 'Bonjour!');
  } finally { await new Promise((r) => server.close(r)); }
});

test('Polling ignores messages from unauthorized numbers', async () => {
  let replySent = false;
  const bridge = {
    getNewMessages: async () => [{ from: '+19999999999', body: 'hi' }],
    sendMessage: async () => { replySent = true; },
    isReady: async () => true,
  };

  const server = await createServer(
    { ...BASE_CONFIG, GEMINI_API_KEY: 'gk1', POLL_INTERVAL_MS: 30 },
    { bridge, chat: async () => 'reply' },
  );
  try {
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(replySent, false);
  } finally { await new Promise((r) => server.close(r)); }
});

test('Polling keeps running after a Gemini error', async () => {
  let chatCalls = 0;
  const bridge = {
    getNewMessages: async () => [{ from: ALLOWED, body: 'hi' }],
    sendMessage: async () => {},
    isReady: async () => true,
  };

  const server = await createServer(
    { ...BASE_CONFIG, GEMINI_API_KEY: 'gk1', POLL_INTERVAL_MS: 30 },
    {
      bridge,
      chat: async () => {
        chatCalls++;
        if (chatCalls === 1) throw new Error('Gemini down');
        return 'ok';
      },
    },
  );
  try {
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(chatCalls >= 2, 'Should have retried after the first error');
  } finally { await new Promise((r) => server.close(r)); }
});

test('No polling loop started when GEMINI_API_KEY is not set', async () => {
  let pollCalled = false;
  const bridge = {
    getNewMessages: async () => { pollCalled = true; return []; },
    sendMessage: async () => {},
    isReady: async () => false,
  };

  const server = await createServer(
    { ...BASE_CONFIG, GEMINI_API_KEY: '', POLL_INTERVAL_MS: 30 },
    { bridge },
  );
  try {
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(pollCalled, false);
  } finally { await new Promise((r) => server.close(r)); }
});

// ── Conversation history ──────────────────────────────────────────────────────

test('Conversation history accumulates across polling ticks', async () => {
  const chatCalls = /** @type {Array<{ historyLength: number, userMessage: string }>} */ ([]);
  let tick = 0;

  const bridge = {
    getNewMessages: async () => {
      tick++;
      if (tick === 1) return [{ from: ALLOWED, body: 'first' }];
      if (tick === 2) return [{ from: ALLOWED, body: 'second' }];
      return [];
    },
    sendMessage: async () => {},
    isReady: async () => true,
  };

  const server = await createServer(
    { ...BASE_CONFIG, GEMINI_API_KEY: 'gk1', POLL_INTERVAL_MS: 30 },
    {
      bridge,
      chat: async ({ history, userMessage }) => {
        chatCalls.push({ historyLength: history.length, userMessage });
        return 'ok';
      },
    },
  );
  try {
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(chatCalls.length >= 2);
    assert.equal(chatCalls[0].historyLength, 0);   // no history on first message
    assert.equal(chatCalls[1].historyLength, 2);   // user + model from first exchange
  } finally { await new Promise((r) => server.close(r)); }
});

// ── 404 ───────────────────────────────────────────────────────────────────────

test('Unknown route returns 404', async () => {
  const { url, close } = await startServer();
  try {
    const res = await fetch(`${url}/anything`);
    assert.equal(res.status, 404);
  } finally { await close(); }
});
