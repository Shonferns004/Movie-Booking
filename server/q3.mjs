import { Client } from 'pg';
const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/movie_booking' });
await c.connect();
const r = await c.query("select provider_payment_id from payments where provider='youpi' order by created_at desc limit 1");
console.log(r.rows[0].provider_payment_id);
await c.end();
