import pg from 'pg';

const { Pool } = pg;

const url = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/movie_booking';
const pool = new Pool({
  connectionString: url,
  ssl: url.includes('supabase.co') ? { rejectUnauthorized: false } : undefined
});

try {
  const r = await pool.query('select current_database() db, current_user usr, version() v');
  console.log('CONNECTED ->', r.rows[0].db, 'as', r.rows[0].usr);
  console.log(r.rows[0].v.split(',')[0]);
  const t = await pool.query("select table_name from information_schema.tables where table_schema='public' order by table_name");
  console.log('TABLES(' + t.rows.length + '):', t.rows.map((x) => x.table_name).join(', ') || '(none)');
} catch (e) {
  console.log('ERROR:', e.message);
}
await pool.end();
