import { Client } from 'pg';
const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/movie_booking' });
await c.connect();
const r = await c.query("select b.id,b.booking_reference,b.status,p.provider_payment_id,p.provider_order_id,p.amount_minor from bookings b join payments p on p.booking_id=b.id where p.provider='youpi' order by b.created_at desc limit 10");
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
