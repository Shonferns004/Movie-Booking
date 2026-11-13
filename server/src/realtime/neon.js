import { env } from '../config/env.js';

/**
 * Neon Realtime.
 *
 * Neon's Live SQL API is a WebSocket sync engine: subscribe to a query and get pushed
 * the new result whenever the data changes. The `client` half of the SDK is JS/TS only
 * (there is no Dart client), so the Worker subscribes once with the trusted *server*
 * SDK and fans a tiny "topic changed" event out to the apps over a WebSocket.
 *
 * Each topic is a cheap invalidation query: it reports THAT something moved, and the
 * clients then refetch their normal endpoints. Keeping the payload empty means the
 * realtime layer never needs to know the shape of the screens.
 */

const TOPICS = {
  /** Movies, theatres, auditoriums and shows: what the catalog screens display. */
  catalog: `
    select
      (select count(*)::text from movies)        as movies,
      (select count(*)::text from theatres)      as theatres,
      (select count(*)::text from auditoriums)   as auditoriums,
      (select count(*)::text from shows)         as shows,
      (select max(updated_at)::text from movies)     as movies_at,
      (select max(updated_at)::text from theatres)   as theatres_at,
      (select max(updated_at)::text from shows)      as shows_at
  `,
  /** Seat availability: holds, bookings and per-seat status. */
  seats: `
    select
      (select count(*)::text from bookings)                             as bookings,
      (select count(*)::text from seat_holds where status = 'active')   as active_holds,
      (select max(expires_at)::text from seat_holds where status = 'active') as hold_expiry,
      (select max(updated_at)::text from show_seats)                    as seats_at,
      (select max(updated_at)::text from bookings)                      as bookings_at
  `,
  /** Payments and tickets: confirmation screens and the observer app. */
  payments: `
    select
      (select count(*)::text from payments)                as payments,
      (select count(*)::text from tickets)                 as tickets,
      (select max(updated_at)::text from payments)         as payments_at
  `,
};

export function isRealtimeConfigured() {
  return Boolean(env.NEON_REALTIME_URL && env.NEON_REALTIME_SECRET);
}

/** The SDK opens a WebSocket; the Console gives an https URL. Normalise it. */
export function realtimeUrl() {
  const raw = (env.NEON_REALTIME_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (raw.startsWith('wss://') || raw.startsWith('ws://')) return raw;
  return raw.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
}

/**
 * Opens one subscription per topic.
 *
 * @param {(topic: string) => void} onTopic called for every committed batch
 * @returns {Promise<{ topics: string[], errors: string[], close: () => void }>}
 */
export async function subscribeChanges(onTopic) {
  if (!isRealtimeConfigured()) {
    throw new Error('Neon Realtime is not configured (NEON_REALTIME_URL / NEON_REALTIME_SECRET)');
  }

  const { createRealtime, rawSql } = await import('@neon/realtime/server');

  const realtime = createRealtime({
    secret: env.NEON_REALTIME_SECRET,
    db: env.NEON_REALTIME_DB || 'neondb',
    url: realtimeUrl(),
    logLevel: 'info',
    logger: (entry) => {
      try {
        const level = typeof entry === 'object' && entry ? entry.level : '';
        const message = typeof entry === 'object' && entry ? entry.message : String(entry);
        if (level === 'info' || level === 'warn' || level === 'error') {
          console.log(`[neon:${level}] ${message}`);
        }
      } catch {
        /* ignore diagnostics */
      }
    },
  });

  const subscriptions = [];
  const errors = [];

  for (const [topic, sql] of Object.entries(TOPICS)) {
    try {
      // Materialized subscription: it exposes the `onChange` hook we need. The rows it
      // carries are ignored; only the fact that the query changed matters.
      const subscription = await realtime.subscribe(rawSql(sql, []));
      subscription.onChange(() => {
        try {
          onTopic(topic);
        } catch {
          // A listener failure must not tear down the subscription.
        }
      });

      // Diagnostics stay quiet unless something is wrong.
      console.log(`[realtime] subscribed "${topic}"`);
      // The SDK's subscription object is frozen, so keep the topic alongside it.
      subscriptions.push({ topic, subscription });
    } catch (err) {
      errors.push(`${topic}: ${err?.message || err}`);
      console.error(`[realtime] failed to subscribe topic "${topic}"`, err);
    }
  }

  return {
    topics: subscriptions.map((s) => s.topic),
    errors,
    close() {
      for (const { subscription } of subscriptions) {
        try {
          subscription.close?.();
        } catch {
          /* already closed */
        }
      }
      try {
        realtime.close?.();
      } catch {
        /* already closed */
      }
    },
  };
}
