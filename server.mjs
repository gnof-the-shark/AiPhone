// @ts-check
/**
 * Standalone entry point — `node server.mjs` or PM2.
 */
import * as config from './lib/config.mjs';
import { createServer } from './lib/http-server.mjs';

export const server = await createServer(config);

async function gracefulShutdown(signal) {
  console.log(`[aiphone:server] stopping signal=${signal}`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM').catch(() => process.exit(1)));
process.on('SIGINT',  () => gracefulShutdown('SIGINT').catch(() => process.exit(1)));
