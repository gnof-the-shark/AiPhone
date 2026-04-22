// @ts-check
/**
 * Simple Gemini API client using Node's built-in `https`.
 */

import https from 'node:https';
import { URL } from 'node:url';

/**
 * Sends a message to Gemini and returns the generated text response.
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {string} params.prompt
 * @returns {Promise<string>}
 */
export async function generateGeminiResponse({ apiKey, model, prompt }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = JSON.stringify({
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      maxOutputTokens: 1000,
    }
  });

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Gemini API error ${res.statusCode}: ${text}`));
          }
          try {
            const response = JSON.parse(text);
            const content = response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!content) {
              return reject(new Error(`Unexpected Gemini response format: ${text}`));
            }
            resolve(content.trim());
          } catch (err) {
            reject(new Error(`Failed to parse Gemini response: ${String(err)}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
