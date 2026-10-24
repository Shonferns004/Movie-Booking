import { env } from './config/env.js';
import { runTick } from './jobs/tick.js';

/**
 * Background maintenance for a long-running host (npm run worker).
 * On serverless platforms use the cron endpoint in modules/internal/routes.js
 * instead - a `while (true)` loop cannot run on Vercel.
 */
async function loop() {
  while (true) {
    try {
      await runTick();
    } catch (e) { console.error(e); }
    await new Promise((r) => setTimeout(r, env.WORKER_POLL_INTERVAL_MS));
  }
}

loop().catch((e) => { console.error(e); process.exit(1); });
