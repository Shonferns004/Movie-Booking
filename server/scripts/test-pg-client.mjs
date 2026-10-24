import { PostgresDatabase, toPostgresPlaceholders } from '../vendor/youpi-pg/packages/db/src/postgres-client.js';

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/movie_booking';

console.log('placeholder mapping:');
console.log(' ', toPostgresPlaceholders('SELECT * FROM t WHERE a = ? AND b = ?'));
console.log(' ', toPostgresPlaceholders("SELECT '?' AS lit, x FROM t WHERE y = ?"));

const db = new PostgresDatabase({ connectionString, schema: 'youpi' });

try {
  db.exec('CREATE SCHEMA IF NOT EXISTS youpi;');
  console.log('schema created');

  db.exec('DROP TABLE IF EXISTS youpi.sync_probe;');
  db.exec('CREATE TABLE youpi.sync_probe (id TEXT PRIMARY KEY, n BIGINT, flag BOOLEAN, ts TIMESTAMPTZ DEFAULT NOW(), meta TEXT);');
  console.log('table created');

  db.execute('INSERT INTO youpi.sync_probe (id, n, flag, meta) VALUES (?, ?, ?, ?)', [
    'a1', 10000, true, JSON.stringify({ hello: 'world' })
  ]);
  db.execute('INSERT INTO youpi.sync_probe (id, n, flag, meta) VALUES (?, ?, ?, ?)', [
    'a2', 20000, false, '{}'
  ]);

  const rows = db.query('SELECT * FROM youpi.sync_probe ORDER BY id');
  console.log('rows:', JSON.stringify(rows, null, 2));

  const one = db.queryOne('SELECT * FROM youpi.sync_probe WHERE id = ?', ['a1']);
  console.log('queryOne n type:', typeof one.n, 'flag type:', typeof one.flag, 'ts type:', typeof one.ts, 'ts value:', one.ts);

  const cnt = db.queryOne('SELECT COUNT(*) AS c FROM youpi.sync_probe');
  console.log('count:', cnt.c, typeof cnt.c);

  // Transaction: rollback path
  try {
    db.transaction(() => {
      db.execute('INSERT INTO youpi.sync_probe (id, n, flag, meta) VALUES (?, ?, ?, ?)', ['a3', 1, true, '{}']);
      throw new Error('boom');
    });
  } catch (e) {
    console.log('rollback ok:', e.message);
  }
  console.log('count after rollback:', db.queryOne('SELECT COUNT(*) AS c FROM youpi.sync_probe').c);

  // Transaction: commit path
  db.transaction(() => {
    db.execute('INSERT INTO youpi.sync_probe (id, n, flag, meta) VALUES (?, ?, ?, ?)', ['a4', 1, true, '{}']);
  });
  console.log('count after commit:', db.queryOne('SELECT COUNT(*) AS c FROM youpi.sync_probe').c);

  // Boolean comparison
  console.log('bool filter:', db.query('SELECT id FROM youpi.sync_probe WHERE flag = $1', [true]).map((r) => r.id));

  // Errors surface properly
  try {
    db.query('SELECT * FROM does_not_exist_table');
  } catch (e) {
    console.log('expected error:', e.message.slice(0, 60));
  }

  db.exec('DROP TABLE youpi.sync_probe;');
  console.log('cleanup done');
} finally {
  db.close();
}
