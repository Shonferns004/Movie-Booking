import { Client } from 'pg';
const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/movie_booking' });
await c.connect();
const r = await c.query("select id, branding from merchants where id='00000000-0000-0000-0000-000000000001'");
console.log(JSON.stringify(r.rows));
await c.end();
