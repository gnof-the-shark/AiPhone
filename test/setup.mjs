// @ts-check
/**
 * Test preload — imported before any test module via NODE_OPTIONS.
 * Zeroes out credentials so no real ClawPhone API calls are ever made.
 */
process.env.CLAWPHONE_API_KEY = "";
process.env.API_TOKEN         = "";
