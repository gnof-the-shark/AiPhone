// @ts-check
/**
 * AiPhone HTTP server.
 *
 * Routes
 * ──────
 *   GET  /health          – liveness probe
 *   POST /sms/incoming    – Twilio webhook: receive an inbound SMS → Gemini reply
 *
 * Gemini can also proactively message the user via the built-in scheduler.
 */

import http from 'node:http';
import { URL } from 'node:url';

import { chat, generateProactive } from './gemini.mjs';
import { sendSms } from './twilio-client.mjs';
import { getHistory, addToHistory } from './conversation.mjs';
import { createScheduler } from './scheduler.mjs';
import { readBody, sendJson, createLogger, parseForm, escapeXml } from './utils.mjs';

const log = createLogger('server');

const SYSTEM_PROMPT =
  'Tu es une IA amicale et curieuse qui communique par SMS avec l\'utilisateur. ' +
  'Tu réponds à ses messages et tu peux aussi initier des conversations quand tu as ' +
  'quelque chose d\'intéressant à partager. Sois concis (max 160 caractères si possible).';

/**
 * @typedef {object} ServerConfig
 * @property {number}   PORT
 * @property {string}   TWILIO_ACCOUNT_SID
 * @property {string}   TWILIO_AUTH_TOKEN
 * @property {string}   TWILIO_PHONE_NUMBER
 * @property {string}   GEMINI_API_KEY
 * @property {string}   GEMINI_MODEL
 * @property {string[]} ALLOWED_NUMBERS
 * @property {number}   PROACTIVE_INTERVAL_MS
 */

/**
 * Create and start the AiPhone HTTP server.
 *
 * @param {ServerConfig} config
 * @param {object}   [deps]                     – injectable overrides for testing
 * @param {Function} [deps.chat]                – Gemini chat function
 * @param {Function} [deps.sendSms]             – Twilio send function
 * @param {Function} [deps.generateProactive]   – Gemini proactive function
 * @returns {Promise<http.Server>}
 */
export async function createServer(config, deps = {}) {
  const {
    PORT,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    ALLOWED_NUMBERS,
    PROACTIVE_INTERVAL_MS,
  } = config;

  const chatFn             = deps.chat             ?? chat;
  const sendSmsFn          = deps.sendSms          ?? sendSms;
  const generateProactiveFn = deps.generateProactive ?? generateProactive;

  // ── Proactive scheduler ────────────────────────────────────────────────────
  let scheduler = null;
  if (GEMINI_API_KEY && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER && ALLOWED_NUMBERS.length > 0) {
    scheduler = createScheduler(
      {
        apiKey:       GEMINI_API_KEY,
        model:        GEMINI_MODEL,
        systemPrompt: SYSTEM_PROMPT,
        accountSid:   TWILIO_ACCOUNT_SID,
        authToken:    TWILIO_AUTH_TOKEN,
        twilioNumber: TWILIO_PHONE_NUMBER,
        phoneNumbers: ALLOWED_NUMBERS,
        intervalMs:   PROACTIVE_INTERVAL_MS,
      },
      { sendSms: sendSmsFn, generateProactive: generateProactiveFn, addToHistory, getHistory, log },
    );
    log.log('proactive scheduler started', { intervalMs: PROACTIVE_INTERVAL_MS });
  }

  // ── Request handler ────────────────────────────────────────────────────────
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', `http://${req.headers.host}`);

    // ── GET /health ──────────────────────────────────────────────────────────
    if (req.method === 'GET' && u.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        twilioConfigured: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER),
        geminiConfigured: !!GEMINI_API_KEY,
        schedulerActive:  scheduler !== null,
      });
      return;
    }

    // ── POST /sms/incoming — Twilio webhook ──────────────────────────────────
    if (req.method === 'POST' && u.pathname === '/sms/incoming') {
      let body;
      try {
        const raw = await readBody(req);
        body = parseForm(raw);
      } catch {
        sendJson(res, 400, { error: 'Invalid form body' });
        return;
      }

      const from     = body.From;
      const userText = body.Body;

      if (!from || !userText) {
        sendJson(res, 400, { error: 'Missing From or Body' });
        return;
      }

      log.log('inbound sms', { from, bodyLength: userText.length });

      // Allowlist check
      if (ALLOWED_NUMBERS.length > 0 && !ALLOWED_NUMBERS.includes(from)) {
        log.warn('unauthorized number', { from });
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Désolé, ce numéro n\'est pas autorisé.</Message></Response>');
        return;
      }

      if (!GEMINI_API_KEY) {
        log.warn('GEMINI_API_KEY not set');
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Désolé, je ne suis pas configuré pour le moment.</Message></Response>');
        return;
      }

      try {
        const history = getHistory(from);
        const reply = await chatFn({
          apiKey:       GEMINI_API_KEY,
          model:        GEMINI_MODEL,
          systemPrompt: SYSTEM_PROMPT,
          history,
          userMessage:  userText,
        });

        addToHistory(from, 'user',  userText);
        addToHistory(from, 'model', reply);
        log.log('gemini reply', { to: from, replyLength: reply.length });

        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(reply)}</Message></Response>`);
      } catch (err) {
        log.error('gemini error', { error: String(err) });
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Désolé, une erreur est survenue.</Message></Response>');
      }
      return;
    }

    // ── 404 ─────────────────────────────────────────────────────────────────
    sendJson(res, 404, { error: 'Not found' });
  });

  server.on('close', () => {
    if (scheduler) scheduler.stop();
  });

  await new Promise((resolve) => {
    server.listen(PORT, () => {
      log.log('listening', { url: `http://localhost:${PORT}` });
      if (!TWILIO_ACCOUNT_SID) log.warn('TWILIO_ACCOUNT_SID not set — outbound SMS disabled');
      if (!GEMINI_API_KEY)     log.warn('GEMINI_API_KEY not set — AI responses disabled');
      resolve(undefined);
    });
  });

  return server;
}
