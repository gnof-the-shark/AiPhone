// @ts-check
/**
 * Proactive message scheduler — periodically asks Gemini whether it wants to
 * send a message to the user.  If Gemini returns a message (instead of "PASS"),
 * it is delivered via Twilio and recorded in the conversation history.
 */

/**
 * @typedef {{ log: Function, warn: Function, error: Function }} Logger
 */

/**
 * @typedef {object} SchedulerDeps
 * @property {Function} sendSms            – Twilio sendSms({ accountSid, authToken, from, to, body })
 * @property {Function} generateProactive  – Gemini proactive generator
 * @property {Function} addToHistory       – Append message to conversation history
 * @property {Function} getHistory         – Retrieve conversation history
 * @property {Logger}   log
 */

/**
 * @typedef {object} SchedulerConfig
 * @property {string}   apiKey
 * @property {string}   model
 * @property {string}   systemPrompt
 * @property {string}   accountSid
 * @property {string}   authToken
 * @property {string}   twilioNumber
 * @property {string[]} phoneNumbers
 * @property {number}   intervalMs
 */

/**
 * Start the proactive message scheduler.
 * Returns a handle to stop it.
 *
 * @param {SchedulerConfig} config
 * @param {SchedulerDeps}   deps
 * @returns {{ stop: () => void }}
 */
export function createScheduler(config, deps) {
  const {
    apiKey, model, systemPrompt,
    accountSid, authToken, twilioNumber,
    phoneNumbers, intervalMs,
  } = config;
  const { sendSms, generateProactive, addToHistory, getHistory, log } = deps;

  async function tick() {
    for (const phone of phoneNumbers) {
      try {
        const history = getHistory(phone);
        const message = await generateProactive({ apiKey, model, systemPrompt, history });

        if (!message) {
          log.log('scheduler: gemini passed', { phone });
          continue;
        }

        log.log('scheduler: sending proactive message', { phone, length: message.length });
        await sendSms({ accountSid, authToken, from: twilioNumber, to: phone, body: message });
        addToHistory(phone, 'model', message);
      } catch (err) {
        log.error('scheduler: error', { phone, error: String(err) });
      }
    }
  }

  const timer = setInterval(
    () => tick().catch((err) => log.error('scheduler: tick failed', { error: String(err) })),
    intervalMs,
  );

  // Don't keep the Node.js process alive just for the scheduler.
  timer.unref();

  return { stop: () => clearInterval(timer) };
}
