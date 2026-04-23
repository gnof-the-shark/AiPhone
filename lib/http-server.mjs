// @ts-check
/**
 * AiPhone HTTP server.
 *
 * Routes
 * ──────
 *   GET /health   – liveness probe
 *
 * SMS is transported entirely through Fongo running in an Android emulator,
 * accessed via ADB.  Two background loops run from startup:
 *
 *  1. SMS poller   – every POLL_INTERVAL_MS, checks Fongo's notifications for
 *                    new inbound messages, sends each to Gemini, and replies.
 *  2. Proactive scheduler – every PROACTIVE_INTERVAL_MS, asks Gemini whether
 *                    it wants to start a conversation; sends if not "PASS".
 */

import http from 'node:http';
import { URL } from 'node:url';

import { chat, generateProactive } from './gemini.mjs';
import { createAndroidBridge } from './android-bridge.mjs';
import { getHistory, addToHistory } from './conversation.mjs';
import { createScheduler } from './scheduler.mjs';
import { sendJson, createLogger } from './utils.mjs';

const log = createLogger('server');

const SYSTEM_PROMPT =
  "Tu es une IA amicale et curieuse qui communique par SMS avec l'utilisateur. " +
  'Tu réponds à ses messages et tu peux aussi initier des conversations quand tu as ' +
  'quelque chose d\'intéressant à partager. Sois concis (max 160 caractères si possible).';

/**
 * @typedef {object} ServerConfig
 * @property {number}   PORT
 * @property {string}   ADB_DEVICE
 * @property {string}   ADB_PATH
 * @property {string}   GEMINI_API_KEY
 * @property {string}   GEMINI_MODEL
 * @property {string[]} ALLOWED_NUMBERS
 * @property {number}   POLL_INTERVAL_MS
 * @property {number}   PROACTIVE_INTERVAL_MS
 */

/**
 * Create and start the AiPhone server.
 *
 * @param {ServerConfig} config
 * @param {object}   [deps]
 * @param {object}   [deps.bridge]             – Android bridge override (for testing)
 * @param {Function} [deps.chat]               – Gemini chat fn override
 * @param {Function} [deps.generateProactive]  – Gemini proactive fn override
 * @returns {Promise<http.Server>}
 */
export async function createServer(config, deps = {}) {
  const {
    PORT,
    ADB_DEVICE,
    ADB_PATH,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    ALLOWED_NUMBERS,
    POLL_INTERVAL_MS,
    PROACTIVE_INTERVAL_MS,
  } = config;

  const chatFn              = deps.chat              ?? chat;
  const generateProactiveFn = deps.generateProactive ?? generateProactive;
  const bridge              = deps.bridge            ?? createAndroidBridge({ device: ADB_DEVICE, adbPath: ADB_PATH });

  const timers = /** @type {NodeJS.Timeout[]} */ ([]);

  // ── SMS polling loop ────────────────────────────────────────────────────────

  if (GEMINI_API_KEY) {
    async function pollOnce() {
      let messages;
      try {
        messages = await bridge.getNewMessages();
      } catch (err) {
        log.error('poll: getNewMessages failed', { error: String(err) });
        return;
      }

      for (const { from, body } of messages) {
        if (ALLOWED_NUMBERS.length > 0 && !ALLOWED_NUMBERS.includes(from)) {
          log.warn('poll: unauthorized number', { from });
          continue;
        }

        log.log('poll: inbound sms', { from, bodyLength: body.length });

        try {
          const history = getHistory(from);
          const reply = await chatFn({
            apiKey:       GEMINI_API_KEY,
            model:        GEMINI_MODEL,
            systemPrompt: SYSTEM_PROMPT,
            history,
            userMessage:  body,
          });

          addToHistory(from, 'user',  body);
          addToHistory(from, 'model', reply);
          await bridge.sendMessage(from, reply);
          log.log('poll: reply sent', { to: from, replyLength: reply.length });
        } catch (err) {
          log.error('poll: processing error', { from, error: String(err) });
        }
      }
    }

    const pollTimer = setInterval(
      () => pollOnce().catch((err) => log.error('poll: uncaught', { error: String(err) })),
      POLL_INTERVAL_MS,
    );
    pollTimer.unref();
    timers.push(pollTimer);
    log.log('sms polling started', { intervalMs: POLL_INTERVAL_MS });
  }

  // ── Proactive scheduler ─────────────────────────────────────────────────────

  let scheduler = null;
  if (GEMINI_API_KEY && ALLOWED_NUMBERS.length > 0) {
    scheduler = createScheduler(
      {
        apiKey:       GEMINI_API_KEY,
        model:        GEMINI_MODEL,
        systemPrompt: SYSTEM_PROMPT,
        phoneNumbers: ALLOWED_NUMBERS,
        intervalMs:   PROACTIVE_INTERVAL_MS,
      },
      {
        sendMessage:       (to, body) => bridge.sendMessage(to, body),
        generateProactive: generateProactiveFn,
        addToHistory,
        getHistory,
        log,
      },
    );
    log.log('proactive scheduler started', { intervalMs: PROACTIVE_INTERVAL_MS });
  }

  // ── HTTP server (health only) ───────────────────────────────────────────────

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && u.pathname === '/health') {
      const bridgeReady = await bridge.isReady().catch(() => false);
      sendJson(res, 200, {
        ok:               true,
        bridgeReady,
        geminiConfigured: !!GEMINI_API_KEY,
        schedulerActive:  scheduler !== null,
      });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  });

  server.on('close', () => {
    for (const t of timers) clearInterval(t);
    if (scheduler) scheduler.stop();
  });

  await new Promise((resolve) => {
    server.listen(PORT, () => {
      log.log('listening', { url: `http://localhost:${PORT}` });
      if (!GEMINI_API_KEY) log.warn('GEMINI_API_KEY not set — AI disabled');
      resolve(undefined);
    });
  });

  return server;
}
