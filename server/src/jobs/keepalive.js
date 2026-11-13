import { pool } from '../db/pool.js';

/**
 * Free-tier Postgres (Neon included) suspends when idle and can be removed after long
 * inactivity. Writing one row to a tiny marker table keeps the project alive.
 *
 * One row every two days is enough, so this is safe to call from a frequent cron:
 * it only inserts when the newest row is older than the window.
 */
const KEEPALIVE_INTERVAL_MS = 48 * 60 * 60 * 1000;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS temp (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

/**
 * Writes a keep-alive row if the last one is older than two days.
 * Pass `{ force: true }` to always insert (useful for a manual GET).
 */
export async function recordKeepAlive({ force = false } = {}) {
  await pool.query(CREATE_TABLE_SQL);

  if (!force) {
    const { rows } = await pool.query(
      'SELECT id, created_at FROM temp ORDER BY created_at DESC LIMIT 1'
    );
    if (rows.length) {
      const lastEntry = new Date(rows[0].created_at);
      const age = Date.now() - lastEntry.getTime();
      if (age < KEEPALIVE_INTERVAL_MS) {
        return {
          inserted: false,
          lastEntry: lastEntry.toISOString(),
          nextDueAt: new Date(lastEntry.getTime() + KEEPALIVE_INTERVAL_MS).toISOString(),
        };
      }
    }
  }

  const { rows } = await pool.query(
    'INSERT INTO temp (created_at) VALUES (now()) RETURNING id, created_at'
  );
  return { inserted: true, id: rows[0].id, createdAt: rows[0].created_at };
}
