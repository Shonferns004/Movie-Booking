import { pool } from '../db/pool.js';

/** Minutes between saving seat prices and the movie becoming public. */
export const PUBLISH_DELAY_MINUTES = 10;

/**
 * Promote movies whose 10-minute review window has elapsed.
 *
 * This runs from the maintenance tick as well as from public reads, so a
 * serverless deployment without a reliable cron still publishes on time the
 * next time anyone opens the catalogue.
 */
export async function publishDueMovies() {
  const { rowCount } = await pool.query(
    `UPDATE movies
        SET status='published', updated_at=now()
      WHERE status='pending'
        AND updated_at <= now() - ($1::int * interval '1 minute')`,
    [PUBLISH_DELAY_MINUTES],
  );
  return rowCount;
}
