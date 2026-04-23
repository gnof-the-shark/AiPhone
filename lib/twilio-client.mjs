// @ts-check
/**
 * Twilio REST API client — sends SMS via the Twilio Messages resource.
 * Uses Node's built-in `https`; no external SDK required.
 */

import https from 'node:https';

/**
 * Send an outbound SMS via the Twilio Messages API.
 *
 * @param {object} params
 * @param {string} params.accountSid
 * @param {string} params.authToken
 * @param {string} params.from  – Twilio phone number (E.164)
 * @param {string} params.to    – Destination phone number (E.164)
 * @param {string} params.body  – Message text
 * @returns {Promise<{ sid: string, status: string }>}
 */
export async function sendSms({ accountSid, authToken, from, to, body }) {
  const path = `/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const payload = new URLSearchParams({ From: from, To: to, Body: body }).toString();
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.twilio.com',
        path,
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = /** @type {Buffer[]} */ ([]);
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = /** @type {any} */ ({});
          try { parsed = JSON.parse(text); } catch { /* use empty object */ }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ sid: parsed.sid, status: parsed.status });
          } else {
            reject(new Error(`Twilio API error ${res.statusCode}: ${parsed.message ?? text}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
