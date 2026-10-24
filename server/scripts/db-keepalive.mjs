// Keeps a Supabase (or any Postgres) database awake by running a trivial query.
// Usage: node server/scripts/db-keepalive.mjs
import { pool } from '../src/db/pool.js';

try {
  const res = await pool.query('SELECT 1 AS ok');
  console.log(new Date().toISOString(), 'db ok', res.rows);
} catch (e) {
  console.error(new Date().toISOString(), 'db error', e.message);
  process.exit(1);
} finally {
  await pool.end();
}