import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import pg from 'pg';

const API = process.env.API_BASE || 'http://localhost:4000';
const db = new DatabaseSync(path.resolve('vendor/youpi-pg/data/youpi_pg.sqlite'));
const token = (await import('node:fs')).readFileSync('vendor/youpi-pg/data/.secrets/admin_api_token', 'utf8').trim();

// the session that is holding the UPI slot
const active = db.prepare(`select id, order_id, amount_paise, status, customer_id, expires_at
                           from payment_sessions where status = 'ACTIVE' order by created_at desc limit 1`).get();
if (!active) { console.log('no ACTIVE session'); process.exit(0); }
console.log('active session:', active.id, `Rs ${active.amount_paise / 100}`, active.status, 'expires', active.expires_at);

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/movie_booking',
});
await c.connect();
const { rows } = await c.query(
  `select p.provider_order_id, p.status as pay_status, b.booking_reference, b.status as booking_status, b.total_minor
     from payments p join bookings b on b.id = p.booking_id
    where p.provider_order_id = $1`,
  [active.order_id]
);
console.log('movie side:', JSON.stringify(rows[0] || null));
await c.end();

const ref = String(Date.now()).slice(-12).padStart(12, '0');
const res = await fetch(`${API}/youpi/api/v1/checkout/${active.id}/simulate-observation`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    source: 'SMS',
    sender: 'XX1234',
    rawText: `A/C XX1234 credited by Rs ${(active.amount_paise / 100).toFixed(2)} CR. Ref ${ref}.`,
    isTest: true,
    testModeActive: true,
  }),
});
const body = await res.json();
console.log('observation ->', res.status, body.status, body.reason || body.failingCondition || '', JSON.stringify(body.result?.stages?.stage3 || body.stages?.stage3 || {}));

await new Promise((r) => setTimeout(r, 4000));

// attribution + webhook delivery happen a moment after the observation is verified
let session = db.prepare('select id, status, completed_at from payment_sessions where id = ?').get(active.id);
for (let i = 0; i < 20 && session.status === 'ACTIVE'; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  session = db.prepare('select id, status, completed_at from payment_sessions where id = ?').get(active.id);
}
console.log('session now:', JSON.stringify(session));
console.log('slot now:', JSON.stringify(db.prepare('select is_slot_busy, current_active_session_id from payment_receiving_accounts').all()));

const c2 = new pg.Client({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/movie_booking',
});
await c2.connect();
const { rows: after2 } = await c2.query(
  `select b.booking_reference, b.status as booking_status, p.status as pay_status,
          (select count(*)::int from tickets t where t.booking_id = b.id) as tickets
     from payments p join bookings b on b.id = p.booking_id where p.provider_order_id = $1`,
  [active.order_id]
);
console.log('booking now:', JSON.stringify(after2[0] || null));
await c2.end();
db.close();
