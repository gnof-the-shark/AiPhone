// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import { sendOutboundSms } from '../lib/send-sms.mjs';
import { clearIdempotencyStore } from '../lib/idempotency.mjs';

const CONFIG = { smsBodyMaxChars: 1600, idempotencyTtlMs: 60_000 };
const CANADIAN_FROM = '+14165550100';
const VALID_TO      = '+15551234567';

/** Build a minimal deps object with a controllable sendSms mock. */
function makeDeps(sendSms = async () => ({ message_id: 'cp_test', status: 'sent' })) {
  /** @type {Map<string, unknown>} */
  const store = new Map();
  return {
    clawphoneSendSms: sendSms,
    checkIdempotency: (key) => store.get(key) ?? null,
    saveIdempotency:  (key, val, _ttl) => { store.set(key, val); },
    _store: store,
  };
}

test.beforeEach(() => clearIdempotencyStore());

// ── Validation ───────────────────────────────────────────────────────────────

test('sendOutboundSms: rejects non-Canadian from number', async () => {
  const res = await sendOutboundSms({
    from: '+33612345678', to: VALID_TO, body: 'hello',
    idempotencyKey: null, deps: makeDeps(), config: CONFIG,
  });
  assert.equal(res.ok, false);
  assert.equal(/** @type {any} */ (res).statusCode, 422);
  assert.match(/** @type {any} */ (res).error, /Canadian/);
});

test('sendOutboundSms: rejects invalid to number', async () => {
  const res = await sendOutboundSms({
    from: CANADIAN_FROM, to: 'not-a-number', body: 'hello',
    idempotencyKey: null, deps: makeDeps(), config: CONFIG,
  });
  assert.equal(res.ok, false);
  assert.equal(/** @type {any} */ (res).statusCode, 422);
  assert.match(/** @type {any} */ (res).error, /E\.164/);
});

test('sendOutboundSms: rejects empty body', async () => {
  const res = await sendOutboundSms({
    from: CANADIAN_FROM, to: VALID_TO, body: '   ',
    idempotencyKey: null, deps: makeDeps(), config: CONFIG,
  });
  assert.equal(res.ok, false);
  assert.equal(/** @type {any} */ (res).statusCode, 422);
  assert.match(/** @type {any} */ (res).error, /empty/);
});

test('sendOutboundSms: rejects body exceeding max chars', async () => {
  const res = await sendOutboundSms({
    from: CANADIAN_FROM, to: VALID_TO, body: 'x'.repeat(1601),
    idempotencyKey: null, deps: makeDeps(), config: CONFIG,
  });
  assert.equal(res.ok, false);
  assert.equal(/** @type {any} */ (res).statusCode, 422);
  assert.match(/** @type {any} */ (res).error, /maximum length/);
});

// ── Happy path ───────────────────────────────────────────────────────────────

test('sendOutboundSms: returns 201 result on success', async () => {
  const deps = makeDeps(async () => ({ message_id: 'cp_ok', status: 'sent' }));
  const res = await sendOutboundSms({
    from: CANADIAN_FROM, to: VALID_TO, body: 'Hello from AiPhone!',
    idempotencyKey: null, deps, config: CONFIG,
  });
  assert.equal(res.ok, true);
  const result = /** @type {any} */ (res).result;
  assert.equal(result.from,   CANADIAN_FROM);
  assert.equal(result.to,     VALID_TO);
  assert.equal(result.body,   'Hello from AiPhone!');
  assert.equal(result.status, 'sent');
  assert.ok(result.message_id);
  assert.ok(result.created_at);
});

test('sendOutboundSms: trims body whitespace', async () => {
  let sentBody = '';
  const deps = makeDeps(async ({ body }) => { sentBody = body; return {}; });
  const res = await sendOutboundSms({
    from: CANADIAN_FROM, to: VALID_TO, body: '  hi there  ',
    idempotencyKey: null, deps, config: CONFIG,
  });
  assert.equal(res.ok, true);
  assert.equal(sentBody, 'hi there');
});

// ── Idempotency ──────────────────────────────────────────────────────────────

test('sendOutboundSms: second request with same key returns cached result', async () => {
  let calls = 0;
  const deps = makeDeps(async () => { calls++; return { message_id: 'cp_idem', status: 'sent' }; });

  const first = await sendOutboundSms({
    from: CANADIAN_FROM, to: VALID_TO, body: 'once',
    idempotencyKey: 'key-abc', deps, config: CONFIG,
  });
  assert.equal(first.ok, true);
  assert.equal(calls, 1);

  const second = await sendOutboundSms({
    from: CANADIAN_FROM, to: VALID_TO, body: 'once',
    idempotencyKey: 'key-abc', deps, config: CONFIG,
  });
  assert.equal(second.ok, true);
  assert.equal(calls, 1); // ClawPhone was NOT called a second time
  assert.deepEqual(
    /** @type {any} */ (first).result.message_id,
    /** @type {any} */ (second).result.message_id,
  );
});

test('sendOutboundSms: different keys are not deduplicated', async () => {
  let calls = 0;
  const deps = makeDeps(async () => { calls++; return {}; });

  await sendOutboundSms({ from: CANADIAN_FROM, to: VALID_TO, body: 'a', idempotencyKey: 'k1', deps, config: CONFIG });
  await sendOutboundSms({ from: CANADIAN_FROM, to: VALID_TO, body: 'b', idempotencyKey: 'k2', deps, config: CONFIG });
  assert.equal(calls, 2);
});

// ── Provider error ───────────────────────────────────────────────────────────

test('sendOutboundSms: returns 502 when ClawPhone throws', async () => {
  const deps = makeDeps(async () => { throw new Error('ClawPhone 500'); });
  const res = await sendOutboundSms({
    from: CANADIAN_FROM, to: VALID_TO, body: 'hello',
    idempotencyKey: null, deps, config: CONFIG,
  });
  assert.equal(res.ok, false);
  assert.equal(/** @type {any} */ (res).statusCode, 502);
  assert.match(/** @type {any} */ (res).error, /ClawPhone API error/);
});
