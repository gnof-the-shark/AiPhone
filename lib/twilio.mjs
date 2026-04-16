// @ts-check
/**
 * Thin wrapper around the Twilio Node.js helper library for outbound SMS.
 * Kept purposely minimal so it can be swapped out in tests via dependency
 * injection without monkey-patching the real SDK.
 */

import Twilio from 'twilio';

/**
 * @typedef {object} SmsResult
 * @property {string} sid           – Twilio message SID (e.g. "SMxxx")
 * @property {string} status        – Twilio delivery status (e.g. "queued")
 * @property {string} to            – Destination number as normalised by Twilio
 * @property {string} from          – Sender number as normalised by Twilio
 */

/**
 * Create a Twilio client that can send outbound SMS messages.
 *
 * @param {{ accountSid: string, authToken: string, _twilioFactory?: Function }} opts
 * @returns {{ sendSms: (opts: { to: string, from: string, body: string }) => Promise<SmsResult> }}
 */
export function createTwilioClient({ accountSid, authToken, _twilioFactory }) {
  if (!accountSid || !authToken) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
  }

  // _twilioFactory is an escape hatch for tests; production always uses new Twilio().
  const client = _twilioFactory
    ? _twilioFactory(accountSid, authToken)
    // @ts-expect-error — Twilio's types declare the default export as a function, not a constructor
    : new Twilio(accountSid, authToken);

  /**
   * @param {{ to: string, from: string, body: string }} params
   * @returns {Promise<SmsResult>}
   */
  async function sendSms({ to, from, body }) {
    if (!to || !from) throw new Error(`Missing to/from (to=${to}, from=${from})`);

    const msg = await client.messages.create({ to, from, body: body || '' });

    return {
      sid:    msg.sid,
      status: msg.status,
      to:     msg.to,
      from:   msg.from,
    };
  }

  return { sendSms };
}
