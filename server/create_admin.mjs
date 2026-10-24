import { pool } from './src/db/pool.js';
const hash = '$2a$10$zkJPCaOzzZwyOF44A7KeI.MGOEvXGDokyyP5K440TRYMyWx4h0726';
const { rows } = await pool.query("INSERT INTO users (email, password_hash, display_name, status) VALUES ($1,$2,$3,'active') ON CONFLICT (email) DO UPDATE SET password_hash=$2 RETURNING id", ['adminapp@movie.local', hash, 'App Admin']);
const uid = rows[0].id;
const { rows: r } = await pool.query("SELECT id FROM roles WHERE name='ADMIN'");
await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, r[0].id]);
console.log('done', uid);
await pool.end();
