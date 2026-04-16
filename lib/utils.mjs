// @ts-check
/**
 * Utility helpers shared across modules.
 */

// E.164 format: + followed by 7–15 digits.
const E164_RE = /^\+[1-9]\d{6,14}$/;

/**
 * Returns true if `value` is a valid E.164 phone number.
 * @param {string} value
 * @returns {boolean}
 */
export function isE164(value) {
  return typeof value === 'string' && E164_RE.test(value);
}

/**
 * Returns true if `value` is a Canadian phone number in E.164 format.
 * Canadian numbers use country code +1 followed by 10 NANP digits whose
 * NPA (area code) starts with 2–9, e.g. +14165550100 (Toronto).
 * @param {string} value
 * @returns {boolean}
 */
export function isCanadianE164(value) {
  // +1 followed by exactly 10 digits; area code digit 2–9 (NANP rule)
  return typeof value === 'string' && /^\+1[2-9]\d{9}$/.test(value);
}

/**
 * Read the full request body as a UTF-8 string.
 * Rejects with a 413 error if the body exceeds `maxBytes`.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [maxBytes=65536]
 * @returns {Promise<string>}
 */
export function readBody(req, maxBytes = 65_536) {
  return new Promise((resolve, reject) => {
    const chunks = /** @type {Buffer[]} */ ([]);
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        const err = /** @type {any} */ (new Error('Request body too large'));
        err.statusCode = 413;
        reject(err);
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Send a JSON response.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Structured logger — produces log/warn/error helpers with a namespace prefix,
 * mirroring the pattern used in ClawPhone.
 *
 * @param {string} ns
 */
export function createLogger(ns) {
  const prefix = `[aiphone:${ns}]`;
  return {
    /** @param {string} msg @param {Record<string,unknown>} [meta] */
    log:   (msg, meta) => console.log(  prefix, msg, ...(meta ? [meta] : [])),
    /** @param {string} msg @param {Record<string,unknown>} [meta] */
    warn:  (msg, meta) => console.warn( prefix, msg, ...(meta ? [meta] : [])),
    /** @param {string} msg @param {Record<string,unknown>} [meta] */
    error: (msg, meta) => console.error(prefix, msg, ...(meta ? [meta] : [])),
  };
}
