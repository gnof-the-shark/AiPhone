import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Interface for interacting with Google's Gemini API.
 */
export function createGeminiClient({ apiKey, modelName = "gemini-1.5-flash" }) {
  if (!apiKey) {
    return {
      generateResponse: async () => "Gemini API key is not configured.",
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  /**
   * Generates a text response from Gemini based on the provided prompt.
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async function generateResponse(prompt) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error("[aiphone:gemini] Error generating response:", error);
      return "Désolé, j'ai rencontré une erreur en traitant votre demande.";
    }
  }

  return { generateResponse };
}
