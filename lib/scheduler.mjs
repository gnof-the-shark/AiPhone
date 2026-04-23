// @ts-check
/**
 * Proactive message scheduler — periodically asks Gemini whether it wants to
 * send a message to the user.  Transport-agnostic: receives a generic
 * sendMessage(to, body) function so it works with any SMS backend.
 */

/**
 * @typedef {{ log: Function, warn: Function, error: Function }} Logger
 */

/**
 * @typedef {object} SchedulerConfig
 * @property {string}   apiKey
 * @property {string}   model
 * @property {string}   systemPrompt
 * @property {string[]} phoneNumbers
 * @property {number}   intervalMs
 */

/**
 * @typedef {object} SchedulerDeps
 * @property {(to: string, body: string) => Promise<void>} sendMessage
 * @property {Function} generateProactive
 * @property {Function} addToHistory
 * @property {Function} getHistory
 * @property {Logger}   log
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
  const { apiKey, model, systemPrompt, phoneNumbers, intervalMs } = config;
  const { sendMessage, generateProactive, addToHistory, getHistory, log } = deps;

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
        await sendMessage(phone, message);
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
  timer.unref();

  return { stop: () => clearInterval(timer) };
}
