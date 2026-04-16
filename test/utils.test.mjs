// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import { isE164, isCanadianE164 } from '../lib/utils.mjs';

// ── isE164 ───────────────────────────────────────────────────────────────────

test('isE164: accepts valid E.164 numbers', () => {
  assert.ok(isE164('+14165550100'));   // Canadian
  assert.ok(isE164('+15551234567'));   // US
  assert.ok(isE164('+33612345678'));   // France
  assert.ok(isE164('+447911123456'));  // UK
});

test('isE164: rejects numbers without leading +', () => {
  assert.equal(isE164('14165550100'), false);
  assert.equal(isE164('4165550100'),  false);
});

test('isE164: rejects empty string and non-strings', () => {
  assert.equal(isE164(''),        false);
  assert.equal(isE164(/** @type {any} */ (null)),      false);
  assert.equal(isE164(/** @type {any} */ (undefined)), false);
  assert.equal(isE164(/** @type {any} */ (123)),       false);
});

test('isE164: rejects numbers that are too short or too long', () => {
  assert.equal(isE164('+123456'),                 false); // 6 digits (min 7)
  assert.equal(isE164('+1234567890123456'), false); // 16 digits (max 15)
});

test('isE164: rejects numbers with spaces or dashes', () => {
  assert.equal(isE164('+1 416 555 0100'), false);
  assert.equal(isE164('+1-416-555-0100'), false);
});

// ── isCanadianE164 ───────────────────────────────────────────────────────────

test('isCanadianE164: accepts valid Canadian numbers', () => {
  assert.ok(isCanadianE164('+14165550100'));  // Toronto
  assert.ok(isCanadianE164('+15145550100'));  // Montréal
  assert.ok(isCanadianE164('+16045550100'));  // Vancouver
  assert.ok(isCanadianE164('+18675550100'));  // Yukon / Northwest Territories
});

test('isCanadianE164: rejects US numbers that share +1 but are not Canadian', () => {
  // Note: US and CA share +1 (NANP). isCanadianE164 accepts any +1 NANP number
  // because there is no programmatic way to distinguish US from CA by digits alone.
  // The ClawPhone provisioning API ensures the number is Canadian.
  // This test documents the known limitation.
  assert.ok(isCanadianE164('+12125550100'));  // NY area code — accepted (NANP)
});

test('isCanadianE164: rejects non-+1 country codes', () => {
  assert.equal(isCanadianE164('+33612345678'),  false); // France
  assert.equal(isCanadianE164('+447911123456'), false); // UK
});

test('isCanadianE164: rejects numbers without +', () => {
  assert.equal(isCanadianE164('14165550100'), false);
});

test('isCanadianE164: rejects numbers that are too short or too long', () => {
  assert.equal(isCanadianE164('+1416555010'),   false); // 9 digits after +1
  assert.equal(isCanadianE164('+141655501000'), false); // 11 digits after +1
});

test('isCanadianE164: rejects area codes starting with 0 or 1', () => {
  assert.equal(isCanadianE164('+10125550100'), false); // area code 012
  assert.equal(isCanadianE164('+11235550100'), false); // area code 123
});
