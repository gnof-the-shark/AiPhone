// @ts-check
/**
 * Gemini API client — multi-turn conversational SMS interface.
 * Uses Node's built-in `https`; no external SDK required.
 */

import https from 'node:https';

/**
 * Send a user message to Gemini with full conversation history.
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {string} params.systemPrompt
 * @param {Array<{ role: string, parts: Array<{ text: string }> }>} params.history
 * @param {string} params.userMessage
 * @returns {Promise<string>}
 */
export async function chat({ apiKey, model, systemPrompt, history, userMessage }) {
  const contents = [
    ...history,
    { role: 'user', parts: [{ text: userMessage }] },
  ];
  return callGemini(apiKey, model, systemPrompt, contents);
}

/**
 * Ask Gemini whether it wants to send a proactive message.
 * Returns the message text, or null if Gemini replied "PASS".
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {string} params.systemPrompt
 * @param {Array<{ role: string, parts: Array<{ text: string }> }>} params.history
 * @returns {Promise<string | null>}
 */
export async function generateProactive({ apiKey, model, systemPrompt, history }) {
  const now = new Date().toLocaleString('fr-FR', { timeZone: 'America/Toronto' });
  const prompt = `Il est ${now} (heure de Toronto). Si tu as quelque chose d'intéressant à partager avec l'utilisateur, envoie-lui un message maintenant. Sinon, réponds uniquement avec le mot "PASS".`;

  const contents = [
    ...history,
    { role: 'user', parts: [{ text: prompt }] },
  ];

  const response = await callGemini(apiKey, model, systemPrompt, contents);
  return response.trim().toUpperCase() === 'PASS' ? null : response;
}

/**
 * Low-level Gemini API call.
 *
 * @param {string} apiKey
 * @param {string} model
 * @param {string} systemPrompt
 * @param {Array<{ role: string, parts: Array<{ text: string }> }>} contents
 * @returns {Promise<string>}
 */
function callGemini(apiKey, model, systemPrompt, contents) {
  if (!apiKey) return Promise.reject(new Error('GEMINI_API_KEY is not set'));

  const path = `/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: 500 },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = /** @type {Buffer[]} */ ([]);
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Gemini API error ${res.statusCode}: ${text}`));
          }
          try {
            const data = JSON.parse(text);
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!content) return reject(new Error(`Unexpected Gemini response: ${text}`));
            resolve(content.trim());
          } catch (err) {
            reject(new Error(`Failed to parse Gemini response: ${String(err)}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
