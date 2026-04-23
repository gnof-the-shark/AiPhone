// @ts-check
/**
 * In-memory per-number conversation history for Gemini multi-turn chat.
 * Each message follows the Gemini format:
 *   { role: 'user' | 'model', parts: [{ text: string }] }
 */

/** @type {Map<string, Array<{ role: string, parts: Array<{ text: string }> }>>} */
const store = new Map();

const MAX_MESSAGES = 50;

/**
 * Get the conversation history for a phone number.
 *
 * @param {string} phone
 * @returns {Array<{ role: string, parts: Array<{ text: string }> }>}
 */
export function getHistory(phone) {
  return store.get(phone) ?? [];
}

/**
 * Append a message to the conversation history for a phone number.
 * Trims the oldest messages when the limit is reached.
 *
 * @param {string} phone
 * @param {'user' | 'model'} role
 * @param {string} text
 */
export function addToHistory(phone, role, text) {
  const history = store.get(phone) ?? [];
  history.push({ role, parts: [{ text }] });
  if (history.length > MAX_MESSAGES) {
    history.splice(0, history.length - MAX_MESSAGES);
  }
  store.set(phone, history);
}

/**
 * Clear conversation history for a specific phone number, or all numbers.
 *
 * @param {string} [phone]
 */
export function clearHistory(phone) {
  if (phone !== undefined) {
    store.delete(phone);
  } else {
    store.clear();
  }
}
