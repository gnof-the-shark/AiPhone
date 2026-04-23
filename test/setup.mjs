// @ts-check
/**
 * Test preload — imported before any test module via NODE_OPTIONS.
 * Zeroes out credentials so no real ADB or Gemini API calls are ever made.
 */
process.env.GEMINI_API_KEY = '';
process.env.ADB_DEVICE     = 'emulator-5554';
process.env.ADB_PATH       = 'adb';
