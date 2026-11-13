import { env } from '../config/env.js';
import { isRealtimeConfigured, subscribeChanges } from './neon.js';

/**
 * Neon Realtime relay (Node host).
 *
 * The Durable Object cannot hold Neon's WebSocket (the SDK's connection goes silent in
 * the Workers runtime), but it works perfectly in Node. This host is always on for the
 * payment gateway anyway, so it holds the one subscription and forwards a tiny
 * `{ topic }` event to the Worker, which fans it out to every connected app.
 *
 * Start it from `src/gateway-only.js` (Render) or `src/server.js`.
 */

let handle = null;
let retry = null;
let stopping = false;

const RETRY_MS = 10000;

export function startRealtimeRelay() {
  if (!isRealtimeConfigured()) {
    console.log('[realtime] relay idle: NEON_REALTIME_URL / NEON_REALTIME_SECRET not set');
    return;
  }
  const target = env.REALTIME_RELAY_URL;
  if (!target) {
    console.log('[realtime] relay idle: REALTIME_RELAY_URL not set');
    return;
  }

  stopping = false;

  const connect = async () => {
    if (stopping) return;
    try {
      handle = await subscribeChanges(async (topic) => {
        try {
          const res = await fetch(target, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${env.INTERNAL_CRON_SECRET}`,
            },
            body: JSON.stringify({ topic, at: Date.now() }),
          });
          if (!res.ok) console.error('[realtime] relay POST failed', res.status);
        } catch (err) {
          console.error('[realtime] relay POST error', err?.message || err);
        }
      });
      console.log('[realtime] relay subscribed to Neon');

      // If the subscription reports a closed status, rebuild it.
      handle.onClosed?.(() => scheduleRetry());
    } catch (err) {
      console.error('[realtime] relay subscribe failed', err?.message || err);
      scheduleRetry();
    }
  };

  const scheduleRetry = () => {
    if (stopping) return;
    try {
      handle?.close?.();
    } catch {
      /* ignore */
    }
    handle = null;
    clearTimeout(retry);
    retry = setTimeout(connect, RETRY_MS);
  };

  void connect();
}

export function stopRealtimeRelay() {
  stopping = true;
  clearTimeout(retry);
  try {
    handle?.close?.();
  } catch {
    /* ignore */
  }
  handle = null;
}
