import { startRealtimeRelay } from '../src/realtime/relay.js';

/**
 * Runs the Neon Realtime relay locally.
 *
 * Useful for testing realtime without deploying: start this in one terminal, then open
 * /status (or an app) and make a change. Ctrl+C to stop.
 */
startRealtimeRelay();
console.log('[relay] running — press Ctrl+C to stop');
setInterval(() => {}, 1 << 30);
