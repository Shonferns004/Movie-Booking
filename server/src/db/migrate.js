import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../database/migrations');

async function main() {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [file]).catch(() => ({ rows: [] }));
    if (exists.rows && exists.rows.length) {
      console.log(`skip ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`applying ${file}`);
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
  }
  await pool.end();
  console.log('migrations complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
