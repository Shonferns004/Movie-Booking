/**
 * End-to-end check of the single-port YouPI PG integration:
 *   create order -> checkout session -> synthetic bank observation -> gateway webhook
 *   -> HMAC verified by the movie API -> booking confirmed.
 *
 * Requires the API instance under test to run with YOUPI_ALLOW_DEV_TOOLS=true
 * (the gateway's developer simulator is otherwise not reachable from the public port).
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { getAdminToken } from '@youpi/common';

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:4100';
const DB = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/movie_booking';

function show(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` -> ${extra}` : ''}`);
  if (!ok) process.exitCode = 1;
}

const adminToken = getAdminToken();

const stamp = String(Date.now());
const mobile = `9${stamp.slice(-9)}`;
const email = `e2e${stamp.slice(-9)}@example.com`;

const db = new pg.Client({ connectionString: DB });
await db.connect();

const { rows: shows } = await db.query('select id from shows limit 1');
const { rows: bookingRows } = await db.query(
  `insert into bookings (booking_reference, show_id, status, subtotal_minor, total_minor, currency, contact_email, contact_mobile)
   values ($1, $2, 'pending', 15000, 15000, 'INR', $3, $4)
   returning id, booking_reference, total_minor`,
  [`E2E${stamp}`, shows[0].id, email, mobile]
);
const booking = bookingRows[0];
console.log(`test booking ${booking.booking_reference} (${booking.id})`);

// 1. create the order through the movie API
const orderRes = await fetch(`${BASE}/api/v1/payments/youpi/orders`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ bookingReference: booking.booking_reference, customer: { email } }),
});
const order = await orderRes.json().catch(() => ({}));
show('POST /api/v1/payments/youpi/orders', orderRes.status === 201 && !!order.paymentId, `status ${orderRes.status} ${JSON.stringify(order).slice(0, 220)}`);
show('order exposes a single-port checkout URL', String(order.checkoutUrl || '').startsWith(BASE), order.checkoutUrl);
show('order exposes the gateway prefix for the SDK', String(order.apiUrl || '').endsWith('/youpi'), order.apiUrl);

// 2. the checkout page is reachable through the same port
const page = await fetch(`${BASE}/checkout/${order.paymentId}`);
const pageHtml = await page.text();
show('GET /checkout/:id serves the checkout page', page.status === 200 && pageHtml.includes('YOUPI'), `status ${page.status}`);

// 3. the checkout page signs the customer in (dev OTP) and binds them to the session
const otpRes = await fetch(`${BASE}/youpi/api/v1/customer/send-otp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mobileNumber: mobile, name: 'E2E Tester', email, isNewUser: true }),
});
const otpBody = await otpRes.json().catch(() => ({}));
show('customer send-otp returns the dev OTP', otpRes.status === 200 && !!otpBody.devOtp, `status ${otpRes.status} ${JSON.stringify(otpBody).slice(0, 160)}`);

const verifyRes = await fetch(`${BASE}/youpi/api/v1/customer/verify-otp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mobileNumber: mobile, otp: otpBody.devOtp }),
});
const verifyBody = await verifyRes.json().catch(() => ({}));
show('customer verify-otp returns a session token', verifyRes.status === 200 && !!verifyBody.token, `status ${verifyRes.status}`);

const bindRes = await fetch(`${BASE}/youpi/api/v1/checkout/${order.paymentId}/bind-customer`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: verifyBody.token }),
});
const bindBody = await bindRes.json().catch(() => ({}));
show('bind-customer activates the session', bindRes.status === 200 && bindBody.status === 'ACTIVE', `status ${bindRes.status} session ${bindBody.status}`);

// 4. inject a synthetic bank observation (developer simulator)
const bankRef = String(Date.now()).slice(-12).padStart(12, '0');
const simRes = await fetch(`${BASE}/youpi/api/v1/checkout/${order.paymentId}/simulate-observation`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({
    source: 'SMS',
    sender: 'XX1234',
    rawText: `A/C XX1234 credited by Rs 150.00 CR. Ref ${bankRef}.`,
    isTest: true,
    testModeActive: true,
  }),
});
const sim = await simRes.json().catch(() => ({}));
show('simulate-observation accepted', simRes.status === 200 && sim.success !== false, `status ${simRes.status} ${JSON.stringify(sim.result || sim).slice(0, 600)}`);

// 4. the gateway delivers a signed webhook -> the movie API confirms the booking
let bookingStatus = null;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 750));
  const { rows } = await db.query('select status from bookings where id=$1', [booking.id]);
  bookingStatus = rows[0].status;
  if (bookingStatus === 'confirmed') break;
}
show('webhook confirmed the booking', bookingStatus === 'confirmed', `booking status ${bookingStatus}`);

const { rows: pays } = await db.query(
  "select status, provider_order_id, provider_payment_id from payments where booking_id=$1 and provider='youpi'",
  [booking.id]
);
show('payment row recorded', pays.length === 1 && ['verified', 'paid'].includes(pays[0].status), JSON.stringify(pays));

const { rows: tickets } = await db.query('select count(*)::int as n from tickets where booking_id=$1', [booking.id]);
console.log(`tickets issued: ${tickets[0].n}`);

// cleanup the test booking so the dev database stays tidy
await db.query('delete from payments where booking_id=$1', [booking.id]);
await db.query('delete from bookings where id=$1', [booking.id]);
await db.end();
console.log('\ndone');
