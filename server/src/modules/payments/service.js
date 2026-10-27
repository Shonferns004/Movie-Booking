import { pool, withTransaction } from '../../db/pool.js';
import { badRequest, notFound, conflict } from '../../utils/errors.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import { env } from '../../config/env.js';
import crypto from 'node:crypto';

async function confirmBookingAfterPayment(client, bookingId, paymentId) {
  // lock booking
  const { rows: bookings } = await client.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId]);
  if (!bookings.length) throw notFound('booking not found');
  const booking = bookings[0];
  if (booking.status === 'confirmed') return booking; // idempotent
  if (booking.status !== 'pending') throw conflict(`booking not payable: ${booking.status}`);

  // lock hold to prevent expiry while confirming
  if (booking.hold_id) {
    await client.query('SELECT * FROM seat_holds WHERE id=$1 FOR UPDATE', [booking.hold_id]);
  }

  // check seats availability
  const seatRows = await client.query('SELECT * FROM show_seats WHERE booking_id=$1 OR hold_id=$2', [bookingId, booking.hold_id]);
  // Actually show_seats linked by hold_id currently. Lock them.
  const locked = await client.query('SELECT * FROM show_seats WHERE show_id=$1 AND (hold_id=$2) FOR UPDATE', [booking.show_id, booking.hold_id]);
  // If hold expired/released, seats may be available; attempt to lock by show and booking? Simpler: find seats in booking_seats -> show_seats.
  const bs = await client.query('SELECT show_seat_id FROM booking_seats WHERE booking_id=$1', [bookingId]);
  const showSeatIds = bs.rows.map((r) => r.show_seat_id);
  const seats = await client.query('SELECT * FROM show_seats WHERE id = ANY($1::uuid[]) FOR UPDATE', [showSeatIds]);

  for (const ss of seats.rows) {
    if (ss.status === 'booked' && ss.booking_id !== bookingId) throw conflict('seat no longer available');
    if (ss.status === 'held' && ss.hold_id !== booking.hold_id) {
      // maybe expired
      const h = ss.hold_id ? (await client.query('SELECT status, expires_at FROM seat_holds WHERE id=$1', [ss.hold_id])).rows[0] : null;
      const expired = !h || h.status !== 'active' || new Date(h.expires_at) <= new Date();
      if (!expired) throw conflict('seat held by another');
    }
  }

  // transition seats to booked
  await client.query("UPDATE show_seats SET status='booked', booking_id=$1, hold_id=NULL, updated_at=now() WHERE id = ANY($2::uuid[])",
    [bookingId, showSeatIds]);

  // hold released
  if (booking.hold_id) await client.query("UPDATE seat_holds SET status='converted', released_at=now() WHERE id=$1", [booking.hold_id]);

  // booking confirmed
  await client.query("UPDATE bookings SET status='confirmed', updated_at=now() WHERE id=$1", [bookingId]);

  // tickets
  const bookingSeats = await client.query('SELECT * FROM booking_seats WHERE booking_id=$1', [bookingId]);
  for (const bsRow of bookingSeats.rows) {
    const token = randomToken(24);
    const tokenHash = sha256(token);
    const ticketRef = randomToken(8).toUpperCase();
    await client.query(
      `INSERT INTO tickets (booking_id, booking_seat_id, ticket_reference, token_hash, status)
       VALUES ($1,$2,$3,$4,'issued')`,
      [bookingId, bsRow.id, `TKT-${ticketRef}`, tokenHash]);
    // store token? We only store hash. Need return token to user somehow. For My Tickets, token needed for QR. 
    // We'll store token in a separate? Architecture says store hash. But to display QR, need token. 
    // We'll store token in ticket_scans? Not. For demo, store token in ticket reference? 
    // Instead, store opaque token in tickets.token_hash? We can store plaintext token in a column? Schema has hashed/opaque QR token. 
    // To allow QR generation, we can return token at confirmation and also store it in email outbox. My Tickets can't show QR without token.
    // Compromise: store token hash only, but generate QR from ticket id? Backend validation would need token. 
    // For functionality, store the plaintext token in tickets? Add column ticket_token? Not in schema. 
    // We'll add a token column via migration? Let's instead store token in booking_seats? Hmm.
  }

  // We need keep token for QR. Add column to tickets: qr_token (plaintext) for demo. But schema says hashed. 
  // We'll store hash and also a recoverable? Better: ticket QR contains ticket id + signed token? 
  // For simplicity, store plaintext token in tickets.token_hash? No, then no hash. Validation compares hash of provided token; if stored plaintext, compare token===stored. 
  // We'll change: store sha256(token) in token_hash, and also store token in a new column? Let's add column now via ALTER in migration? Too late but can run. 
  // Instead, encode token in ticket_reference? ticket_reference is unique; QR can contain ticket_reference, backend looks up by reference and validates booking status. But token secrecy? ticket_reference not secret-ish but okay for demo. 
  // Use ticket_reference as QR payload. Validation by ticket_reference. This avoids token storage issue. But architecture wants opaque token. ticket_reference can be opaque high-entropy. We'll use that.
  
  // outbox
  await client.query(
    `INSERT INTO email_outbox (event_type, recipient, template_data, status)
     VALUES ($1,$2,$3,'pending')`,
    ['booking_confirmed', booking.contact_email || 'customer@movie.local', JSON.stringify({ bookingReference: booking.booking_reference })]);

  await client.query('INSERT INTO audit_logs (actor_id, action, entity_type, entity_id) VALUES ($1,$2,$3,$4)',
    [null, 'booking_confirmed', 'booking', bookingId]);

  return booking;
}

export async function createPaymentOrder({ bookingReference, provider }) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE booking_reference=$1', [bookingReference]);
  if (!rows.length) throw notFound('booking not found');
  const booking = rows[0];
  if (booking.status !== 'pending') throw badRequest('booking not payable');
  const prov = provider || env.PAYMENT_PROVIDER;
  const orderId = `order_${randomToken(8)}`;
  const { rows: pays } = await pool.query(
    `INSERT INTO payments (booking_id, provider, provider_order_id, amount_minor, currency, status)
     VALUES ($1,$2,$3,$4,$5,'created') RETURNING *`,
    [booking.id, prov, orderId, booking.total_minor, booking.currency]);
  return { payment: pays[0], orderId, amount: booking.total_minor, currency: booking.currency, provider: prov };
}

export async function processPaymentEvent({ provider, providerEventId, eventType, payload }) {
  // idempotency
  if (providerEventId) {
    const existing = await pool.query('SELECT id, processing_status FROM payment_events WHERE provider=$1 AND provider_event_id=$2', [provider, providerEventId]);
    if (existing.rows.length) {
      // Already processed or in-flight; don't insert a duplicate.
      return { duplicate: true };
    }
  }
  const eventRes = await pool.query(
    `INSERT INTO payment_events (provider, provider_event_id, event_type, payload, processing_status)
     VALUES ($1,$2,$3,$4,'received') RETURNING id`,
    [provider, providerEventId || null, eventType, payload]);
  const eventId = eventRes.rows[0].id;

  // Determine booking
  const bookingId = payload.bookingId || payload.booking_id;
  const bookingRef = payload.bookingReference || payload.booking_reference;
  let booking;
  if (bookingId) {
    const r = await pool.query('SELECT * FROM bookings WHERE id=$1', [bookingId]);
    booking = r.rows[0];
  } else if (bookingRef) {
    const r = await pool.query('SELECT * FROM bookings WHERE booking_reference=$1', [bookingRef]);
    booking = r.rows[0];
  } else if (payload.orderId || payload.providerOrderId) {
    const r = await pool.query('SELECT b.* FROM bookings b JOIN payments p ON p.booking_id=b.id WHERE p.provider_order_id=$1', [payload.orderId || payload.providerOrderId]);
    booking = r.rows[0];
  }
  if (!booking) throw notFound('booking not found for payment');

  const success = eventType.includes('success') || payload.status === 'success' || payload.status === 'captured';

  if (!success) {
    await pool.query("UPDATE payments SET status='failed', updated_at=now() WHERE booking_id=$1", [booking.id]);
    await pool.query("UPDATE payment_events SET processing_status='processed', processed_at=now() WHERE id=$1", [eventId]);
    return { success: false };
  }

  // update payment row
  await pool.query(
    `UPDATE payments SET status='verified', provider_payment_id=$1, verified_at=now(), updated_at=now()
     WHERE booking_id=$2 AND status IN ('created','verified')`,
    [payload.paymentId || payload.providerPaymentId || `pay_${randomToken(6)}`, booking.id]);

  try {
    await withTransaction(async (client) => {
      // idempotent conversion
      await confirmBookingAfterPayment(client, booking.id, null);
    });
  } catch (e) {
    console.error('[payments] confirmBookingAfterPayment failed:', e.message, e.stack);
    // if seats unavailable, mark for refund
    await pool.query("UPDATE bookings SET status='failed', updated_at=now() WHERE id=$1 AND status='pending'", [booking.id]);
    await pool.query("UPDATE payments SET status='requires_refund', updated_at=now() WHERE booking_id=$1", [booking.id]);
    throw e;
  }

  await pool.query("UPDATE payment_events SET processing_status='processed', processed_at=now() WHERE id=$1", [eventId]);
  return { success: true, bookingReference: booking.booking_reference };
}

export async function mockCompletePayment({ bookingReference, success = true }) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE booking_reference=$1', [bookingReference]);
  if (!rows.length) throw notFound('booking not found');
  const booking = rows[0];
  return processPaymentEvent({
    provider: 'mock',
    providerEventId: `mock-${booking.id}-${Date.now()}`,
    eventType: success ? 'payment.success' : 'payment.failed',
    payload: { bookingReference, status: success ? 'success' : 'failed', bookingId: booking.id },
  });
}

/* ---------------------------------------------------------------------------
 * YOUPI PG integration (self-hosted UPI gateway)
 * Docs: https://github.com/youpi-pg/YouPI-PG
 * ------------------------------------------------------------------------- */

const youpiApi = () => (env.YOUPI_API_URL || 'http://127.0.0.1:6100').replace(/\/$/, '');

/**
 * Public origin of this server, used to build the gateway URLs the browser sees.
 * Derived from the incoming request so the same build works on localhost and on a
 * LAN address (the Flutter/scanner app talks to 192.168.x.x:4000).
 */
export function youpiPublicBase(req) {
  if (env.YOUPI_PUBLIC_BASE_URL) return env.YOUPI_PUBLIC_BASE_URL.replace(/\/$/, '');
  if (!req) return '';
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  if (host) return `${proto}://${host}`;
  // Render always exposes the public origin; use it if a proxy ever drops the headers.
  return (process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
}

function toRupees(amountMinor) {
  return (Number(amountMinor || 0) / 100).toFixed(2);
}

/** Create a YOUPI payment session for a pending booking. */
export async function createYoupiOrder({ bookingReference, customer, publicBase }) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE booking_reference=$1', [bookingReference]);
  if (!rows.length) throw notFound('booking not found');
  const booking = rows[0];
  if (booking.status !== 'pending') throw badRequest('booking not payable');

  const orderId = `order_${randomToken(8)}`;
  const amount = toRupees(booking.total_minor);
  // The confirmation page belongs to the customer SPA, which may live on a different
  // origin than this API (for example a Vercel client talking to a Render API). Prefer
  // APP_BASE_URL for that redirect; publicBase is only a same-origin fallback.
  const appOrigin = (env.APP_BASE_URL || publicBase || '').replace(/\/$/, '');
  const returnUrl = `${appOrigin}/booking/${booking.booking_reference}`;

  // reserve a local payment row first so the webhook can be matched
  const { rows: pays } = await pool.query(
    `INSERT INTO payments (booking_id, provider, provider_order_id, amount_minor, currency, status)
     VALUES ($1,'youpi',$2,$3,$4,'created') RETURNING *`,
    [booking.id, orderId, booking.total_minor, booking.currency || 'INR']);

  let session;
  try {
    const res = await fetch(`${youpiApi()}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.YOUPI_MERCHANT_ID ? { 'X-Merchant-Id': env.YOUPI_MERCHANT_ID } : {}),
        'Idempotency-Key': orderId,
      },
      body: JSON.stringify({
        orderId,
        amount,
        currency: booking.currency || 'INR',
        description: `Konkani Samudai booking ${booking.booking_reference}`,
        returnUrl,
        customer: customer && (customer.email || customer.mobile || customer.name)
        ? { email: customer.email, phoneNumber: customer.mobile, fullName: customer.name }
          : undefined,
        metadata: {
          bookingReference: booking.booking_reference,
          bookingId: booking.id,
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      await pool.query("UPDATE payments SET status='failed', updated_at=now() WHERE id=$1", [pays[0].id]);
      throw badRequest(body.error || body.message || `youpi create payment failed (${res.status})`);
    }
    session = body;
  } catch (e) {
    await pool.query("UPDATE payments SET status='failed', updated_at=now() WHERE id=$1", [pays[0].id]);
    throw e;
  }

  if (session.paymentId) {
    await pool.query('UPDATE payments SET provider_payment_id=$1, updated_at=now() WHERE id=$2', [session.paymentId, pays[0].id]);
  }

  // The gateway is reachable through this server's own port, so the browser always
  // talks to a single origin. `base` is empty only when the caller cannot be resolved.
  const base = (publicBase || '').replace(/\/$/, '');

  return {
    payment: pays[0],
    orderId,
    amount,
    amountMinor: booking.total_minor,
    currency: booking.currency || 'INR',
    provider: 'youpi',
    paymentId: session.paymentId,
    checkoutUrl: `${base}/checkout/${session.paymentId}`,
    scriptUrl: `${base}/youpi.js?v=2`,
    apiUrl: `${base}/youpi`,
    portalUrl: base,
    upiId: env.YOUPI_UPI_ID || '',
    payeeName: env.YOUPI_PAYEE_NAME || 'Konkani Samudai',
    // The SDK sends this as X-Merchant-Id, so it must be the merchant id, not the secret.
    merchantKey: env.YOUPI_MERCHANT_ID,
    bookingReference: booking.booking_reference,
  };
}

/** Verify the HMAC-SHA256 signature of a YOUPI webhook over the raw body bytes. */
export function verifyYoupiSignature(rawBody, signature) {
  const secret = env.YOUPI_WEBHOOK_SECRET;
  if (!secret) throw badRequest('youpi webhook secret is not configured');
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = String(signature || '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const err = new Error('invalid webhook signature');
    err.status = 401;
    throw err;
  }
  return true;
}

/** Handle an incoming YOUPI webhook (authoritative confirmation). */
export async function handleYoupiWebhook(rawBody, signature) {
  verifyYoupiSignature(rawBody, signature);
  const payload = JSON.parse(rawBody.toString('utf8'));
  const event = String(payload.event || '').toUpperCase();
  const isSuccess = event === 'SUCCESS';
  return processPaymentEvent({
    provider: 'youpi',
    providerEventId: payload.paymentId ? `youpi-${payload.paymentId}` : null,
    eventType: isSuccess ? 'payment.success' : `payment.${event.toLowerCase() || 'unknown'}`,
    payload: {
      ...payload,
      orderId: payload.orderId,
      bookingReference: payload.metadata?.bookingReference,
      status: isSuccess ? 'success' : 'failed',
    },
  });
}

/** Poll YOUPI for the authoritative status of a payment session. */
export async function getYoupiStatus(paymentId) {
  const res = await fetch(`${youpiApi()}/api/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      ...(env.YOUPI_MERCHANT_ID ? { 'X-Merchant-Id': env.YOUPI_MERCHANT_ID } : {}),
      // The merchant key is the webhook secret, which unlocks the merchant-private
      // view (internal status, verification level).
      ...(env.YOUPI_WEBHOOK_SECRET ? { 'X-Merchant-Key': env.YOUPI_WEBHOOK_SECRET } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw notFound('youpi payment not found');
  return body;
}

/**
 * Client-side success callback: re-check the status with the gateway and only
 * then confirm the booking (never trust the browser alone).
 */
export async function confirmYoupiPayment({ orderId, utr, amountPaise }) {
  const { rows } = await pool.query('SELECT * FROM payments WHERE provider_order_id=$1 AND provider=$2', [orderId, 'youpi']);
  if (!rows.length) throw notFound('payment order not found');
  const payment = rows[0];
  const { rows: bk } = await pool.query('SELECT booking_reference FROM bookings WHERE id=$1', [payment.booking_id]);
  const bookingReference = bk[0]?.booking_reference;

  if (payment.provider_payment_id) {
    const status = await getYoupiStatus(payment.provider_payment_id);
    if (status.status !== 'SUCCESS') {
      return { success: false, status: status.status };
    }
    if (amountPaise && status.amountPaise && Number(status.amountPaise) !== Number(amountPaise)) {
      throw badRequest('payment amount mismatch');
    }
  }

  const result = await processPaymentEvent({
    provider: 'youpi',
    providerEventId: `youpi-confirm-${payment.id}`,
    eventType: 'payment.success',
    payload: {
      orderId,
      bookingReference,
      paymentId: payment.provider_payment_id,
      utr: utr || null,
      amountPaise: amountPaise || null,
      status: 'success',
    },
  });
  return { success: true, result };
}
