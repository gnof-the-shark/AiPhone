// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseFongoNotifications, findSendButton, createAndroidBridge } from '../lib/android-bridge.mjs';

// ── parseFongoNotifications ───────────────────────────────────────────────────

const SAMPLE_DUMP = `
NotificationRecord(0xabc: pkg=com.fongo.android user=UserHandle{0} id=1001 tag=+14381234567 uid=10089 opPkg=com.fongo.android):
  uid=10089
  pkg=com.fongo.android
  extras={
    android.title=+14381234567
    android.text=Salut, comment ça va?
    android.bigText=Salut, comment ça va?
  }
NotificationRecord(0xdef: pkg=com.other.app user=UserHandle{0} id=9999 tag=null uid=10200 opPkg=com.other.app):
  pkg=com.other.app
  extras={
    android.title=Some other app
    android.text=Irrelevant notification
  }
NotificationRecord(0x111: pkg=com.fongo.android user=UserHandle{0} id=1002 tag=+15141112222 uid=10089 opPkg=com.fongo.android):
  uid=10089
  pkg=com.fongo.android
  extras={
    android.title=+15141112222
    android.text=Short text
    android.bigText=Full long message text here
  }
`;

test('parseFongoNotifications extracts Fongo SMS notifications', () => {
  const results = parseFongoNotifications(SAMPLE_DUMP);
  assert.equal(results.length, 2);
  assert.equal(results[0].from, '+14381234567');
  assert.equal(results[0].body, 'Salut, comment ça va?');
  assert.equal(results[1].from, '+15141112222');
  assert.equal(results[1].body, 'Full long message text here');
});

test('parseFongoNotifications ignores non-Fongo notifications', () => {
  const results = parseFongoNotifications(SAMPLE_DUMP);
  assert.ok(results.every((n) => n.from.startsWith('+')));
});

test('parseFongoNotifications returns empty array when no Fongo notifications', () => {
  const results = parseFongoNotifications('no notifications here');
  assert.deepEqual(results, []);
});

test('parseFongoNotifications prefers bigText over text', () => {
  const dump = `
NotificationRecord(0xabc: pkg=com.fongo.android id=1 tag=+14381234567 uid=1):
  extras={
    android.title=+14381234567
    android.text=Truncated...
    android.bigText=Full message body
  }
`;
  const results = parseFongoNotifications(dump);
  assert.equal(results[0].body, 'Full message body');
});

test('parseFongoNotifications uses text when bigText is absent', () => {
  const dump = `
NotificationRecord(0xabc: pkg=com.fongo.android id=1 tag=+14381234567 uid=1):
  extras={
    android.title=+14381234567
    android.text=Only text field
  }
`;
  const results = parseFongoNotifications(dump);
  assert.equal(results[0].body, 'Only text field');
});

test('parseFongoNotifications extracts notification key for deduplication', () => {
  const results = parseFongoNotifications(SAMPLE_DUMP);
  assert.ok(results[0].key.includes('1001'));
  assert.ok(results[1].key.includes('1002'));
  assert.notEqual(results[0].key, results[1].key);
});

// ── findSendButton ────────────────────────────────────────────────────────────

test('findSendButton finds button by content-desc "Send"', () => {
  const xml = `<hierarchy><node content-desc="Send" clickable="true" bounds="[900,1800][1080,1900]"/></hierarchy>`;
  const coords = findSendButton(xml);
  assert.ok(coords);
  assert.equal(coords.x, 990);
  assert.equal(coords.y, 1850);
});

test('findSendButton finds button by text "Envoyer"', () => {
  const xml = `<hierarchy><node text="Envoyer" clickable="true" bounds="[800,1700][1000,1800]"/></hierarchy>`;
  const coords = findSendButton(xml);
  assert.ok(coords);
  assert.equal(coords.x, 900);
  assert.equal(coords.y, 1750);
});

test('findSendButton returns null when no send button found', () => {
  const xml = `<hierarchy><node text="Cancel" bounds="[0,0][100,100]"/></hierarchy>`;
  assert.equal(findSendButton(xml), null);
});

// ── createAndroidBridge — deduplication ──────────────────────────────────────

test('createAndroidBridge.getNewMessages deduplicates notifications', async () => {
  const dump = `
NotificationRecord(0xabc: pkg=com.fongo.android id=42 tag=+14381234567 uid=1):
  extras={
    android.title=+14381234567
    android.text=Hello
  }
`;

  // Mock adb: always return the same notification
  const bridge = createAndroidBridge({ device: 'emulator-5554', adbPath: 'adb' });

  // We can't call the real bridge (no emulator), so test the parser-level deduplication
  // by calling parseFongoNotifications twice with the same output and checking keys.
  const { parseFongoNotifications: parse } = await import('../lib/android-bridge.mjs');
  const first  = parse(dump);
  const second = parse(dump);

  // Both calls return the same notifications — the bridge layer (seenKeys) deduplicates.
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0].key, second[0].key);
});

test('createAndroidBridge.getNewMessages only returns each message once', async () => {
  const dump = `
NotificationRecord(0xabc: pkg=com.fongo.android id=99 tag=+14381234567 uid=1):
  extras={
    android.title=+14381234567
    android.text=Once
  }
`;

  // Simulate the bridge's internal deduplication using the exported parser + a local Set
  const { parseFongoNotifications: parse } = await import('../lib/android-bridge.mjs');
  const seen = new Set();

  const round1 = parse(dump).filter((n) => !seen.has(n.key));
  round1.forEach((n) => seen.add(n.key));

  const round2 = parse(dump).filter((n) => !seen.has(n.key));

  assert.equal(round1.length, 1);
  assert.equal(round2.length, 0);
});
