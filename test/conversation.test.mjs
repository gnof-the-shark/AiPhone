// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import { getHistory, addToHistory, clearHistory } from '../lib/conversation.mjs';

const PHONE = '+14381234567';

test.beforeEach(() => clearHistory());

test('getHistory returns empty array for unknown number', () => {
  assert.deepEqual(getHistory(PHONE), []);
});

test('addToHistory and getHistory round-trip', () => {
  addToHistory(PHONE, 'user', 'Hello');
  addToHistory(PHONE, 'model', 'Hi there!');

  const history = getHistory(PHONE);
  assert.equal(history.length, 2);
  assert.equal(history[0].role, 'user');
  assert.equal(history[0].parts[0].text, 'Hello');
  assert.equal(history[1].role, 'model');
  assert.equal(history[1].parts[0].text, 'Hi there!');
});

test('histories are isolated per phone number', () => {
  addToHistory(PHONE, 'user', 'msg A');
  addToHistory('+19999999999', 'user', 'msg B');

  assert.equal(getHistory(PHONE).length, 1);
  assert.equal(getHistory('+19999999999').length, 1);
});

test('history is trimmed to 50 messages', () => {
  for (let i = 0; i < 60; i++) {
    addToHistory(PHONE, i % 2 === 0 ? 'user' : 'model', `msg ${i}`);
  }
  const history = getHistory(PHONE);
  assert.equal(history.length, 50);
  // The 60 - 50 = 10 oldest messages were dropped; first kept is msg 10
  assert.equal(history[0].parts[0].text, 'msg 10');
});

test('clearHistory(phone) removes only that number', () => {
  addToHistory(PHONE, 'user', 'keep me');
  addToHistory('+19999999999', 'user', 'keep me too');

  clearHistory(PHONE);

  assert.deepEqual(getHistory(PHONE), []);
  assert.equal(getHistory('+19999999999').length, 1);
});

test('clearHistory() with no argument clears all', () => {
  addToHistory(PHONE, 'user', 'a');
  addToHistory('+19999999999', 'user', 'b');

  clearHistory();

  assert.deepEqual(getHistory(PHONE), []);
  assert.deepEqual(getHistory('+19999999999'), []);
});
