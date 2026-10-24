import { pool } from './src/db/pool.js';
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const name of ['CUSTOMER','ADMIN','SCANNER','SUPERVISOR']) {
    await client.query('INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }
  await client.query('COMMIT');
  console.log('roles done');
} catch(e) { console.error(e); await client.query('ROLLBACK'); }
finally { client.release(); await pool.end(); }
