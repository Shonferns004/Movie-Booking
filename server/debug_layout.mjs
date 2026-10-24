import { pool } from './src/db/pool.js';
import { importAllLayouts } from './src/db/importLayouts.js';
const client = await pool.connect();
try {
  await client.query('BEGIN');
  console.log('importing layouts...');
  const r = await importAllLayouts(client);
  console.log('imported', r);
  await client.query('COMMIT');
  console.log('done');
} catch(e) { console.error('ERR', e); await client.query('ROLLBACK'); }
finally { client.release(); await pool.end(); }
