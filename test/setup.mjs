// @ts-check
/**
 * Test preload — imported before any test module via NODE_OPTIONS.
 * Zeroes out credentials so no real Twilio or Gemini API calls are ever made.
 */
process.env.TWILIO_ACCOUNT_SID  = '';
process.env.TWILIO_AUTH_TOKEN   = '';
process.env.TWILIO_PHONE_NUMBER = '';
process.env.GEMINI_API_KEY      = '';
