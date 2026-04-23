// @ts-check
/**
 * Android bridge — communicates with a running Android emulator via ADB.
 *
 * Receiving: polls `adb shell dumpsys notification` for Fongo SMS notifications.
 * Sending:   uses the Android SENDTO intent to open Fongo in compose mode,
 *            then taps the send button via UIAutomator.
 *
 * Fongo package: com.fongo.android
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const FONGO_PACKAGE = 'com.fongo.android';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Run an ADB command and return stdout.
 *
 * @param {string} adbPath
 * @param {string} device
 * @param {string} args
 * @returns {Promise<string>}
 */
async function adb(adbPath, device, args) {
  const { stdout } = await execAsync(`${adbPath} -s ${device} ${args}`, { timeout: 15_000 });
  return stdout;
}

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Notification parser ───────────────────────────────────────────────────────

/**
 * Parse Fongo SMS notifications from `adb shell dumpsys notification` output.
 *
 * Each notification block looks like:
 *   NotificationRecord(0x…: pkg=com.fongo.android … id=1001 tag=+14381234567 …):
 *     …
 *     extras={
 *       android.title=+14381234567
 *       android.bigText=Hello there
 *       android.text=Hello there
 *       …
 *     }
 *
 * Returns all found notifications (deduplication is handled by the bridge).
 *
 * @param {string} output
 * @returns {Array<{ key: string, from: string, body: string }>}
 */
export function parseFongoNotifications(output) {
  const results = [];
  const lines = output.split('\n');

  let inRecord = false;
  let key = /** @type {string|null} */ (null);
  let from = /** @type {string|null} */ (null);
  let body = /** @type {string|null} */ (null);

  const flush = () => {
    if (inRecord && key && from && body) {
      results.push({ key, from, body });
    }
    inRecord = false;
    key = null;
    from = null;
    body = null;
  };

  for (const line of lines) {
    const t = line.trim();

    if (t.startsWith('NotificationRecord(')) {
      flush();
      if (t.includes(`pkg=${FONGO_PACKAGE}`)) {
        inRecord = true;
        const idMatch  = t.match(/\bid=(-?\d+)/);
        const tagMatch = t.match(/\btag=([^\s,)]+)/);
        key = `${idMatch?.[1] ?? '?'}|${tagMatch?.[1] ?? '?'}`;
      }
      continue;
    }

    if (!inRecord) continue;

    // Sender phone number
    if (t.startsWith('android.title=')) {
      from = t.slice('android.title='.length).trim();
      continue;
    }
    // Full message text (bigText takes priority over text, which can be truncated)
    if (t.startsWith('android.bigText=')) {
      body = t.slice('android.bigText='.length).trim();
      continue;
    }
    if (t.startsWith('android.text=') && !body) {
      body = t.slice('android.text='.length).trim();
      continue;
    }
  }

  flush();
  return results;
}

// ── UIAutomator XML helper ────────────────────────────────────────────────────

/**
 * Find the send button in a UIAutomator XML dump.
 * Returns the { x, y } centre of the button, or null if not found.
 *
 * @param {string} xml
 * @returns {{ x: number, y: number } | null}
 */
export function findSendButton(xml) {
  const patterns = [
    // Accessibility label (most reliable)
    /content-desc="(?:Send|Envoyer)"[^/]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
    // Visible text label
    /\btext="(?:Send|Envoyer)"[^/]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
    // Resource-id containing "send" on a clickable element
    /resource-id="[^"]*[Ss]end[^"]*"\s[^/]*clickable="true"[^/]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  ];

  for (const pattern of patterns) {
    const m = xml.match(pattern);
    if (m) {
      return {
        x: Math.round((parseInt(m[1]) + parseInt(m[3])) / 2),
        y: Math.round((parseInt(m[2]) + parseInt(m[4])) / 2),
      };
    }
  }
  return null;
}

// ── Bridge factory ────────────────────────────────────────────────────────────

/**
 * Create an Android bridge for interacting with Fongo via ADB.
 *
 * @param {object} [opts]
 * @param {string} [opts.device]   – ADB device serial  (default: 'emulator-5554')
 * @param {string} [opts.adbPath]  – Path to the adb binary (default: 'adb')
 * @returns {{
 *   getNewMessages: () => Promise<Array<{ from: string, body: string }>>,
 *   sendMessage:    (to: string, body: string) => Promise<void>,
 *   isReady:        () => Promise<boolean>,
 * }}
 */
export function createAndroidBridge({ device = 'emulator-5554', adbPath = 'adb' } = {}) {
  /** @type {Set<string>} Notification keys we've already processed */
  const seenKeys = new Set();

  /**
   * Poll Fongo notifications and return only new (unseen) SMS messages.
   */
  async function getNewMessages() {
    const output = await adb(adbPath, device, 'shell dumpsys notification');
    const all = parseFongoNotifications(output);
    const fresh = all.filter((n) => !seenKeys.has(n.key));
    for (const n of fresh) seenKeys.add(n.key);
    return fresh.map(({ from, body }) => ({ from, body }));
  }

  /**
   * Send an SMS via Fongo using the SENDTO intent + UIAutomator tap.
   *
   * @param {string} to   – E.164 destination number
   * @param {string} body – Message text
   */
  async function sendMessage(to, body) {
    // Strip any character that isn't +/digit to prevent shell injection
    const safeTo = to.replace(/[^+0-9]/g, '');
    // Escape single quotes; truncate to 1600 chars (10 GSM-7 segments)
    const safeBody = body.replace(/'/g, "\\'").slice(0, 1600);

    // Step 1 — open Fongo in SMS compose mode with pre-filled body
    await adb(
      adbPath, device,
      `shell am start -a android.intent.action.SENDTO -d "smsto:${safeTo}" --es sms_body $'${safeBody}'`,
    );
    await sleep(2500);

    // Step 2 — dump the UI hierarchy
    await adb(adbPath, device, 'shell uiautomator dump /sdcard/aidump.xml').catch(() => {});
    const xml = await adb(adbPath, device, 'shell cat /sdcard/aidump.xml').catch(() => '');

    // Step 3 — tap the send button, or fall back to ENTER
    const coords = findSendButton(xml);
    if (coords) {
      await adb(adbPath, device, `shell input tap ${coords.x} ${coords.y}`);
    } else {
      await adb(adbPath, device, 'shell input keyevent 66');
    }
    await sleep(1500);

    // Step 4 — dismiss Fongo so it doesn't stay in the foreground
    await adb(adbPath, device, 'shell input keyevent KEYCODE_BACK').catch(() => {});
  }

  /**
   * Returns true when the emulator has finished booting.
   */
  async function isReady() {
    try {
      const out = await adb(adbPath, device, 'shell getprop sys.boot_completed');
      return out.trim() === '1';
    } catch {
      return false;
    }
  }

  return { getNewMessages, sendMessage, isReady };
}
