import { pool, withTransaction } from '../../db/pool.js';
import { badRequest, notFound, conflict, forbidden, serviceUnavailable } from '../../utils/errors.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import { env } from '../../config/env.js';
import { IS_WORKERS } from '../../config/runtime.js';
import { guestTokenForReference } from '../bookings/service.js';
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

  // WhatsApp ticket PDF, processed by the maintenance tick when a mobile is known.
  if (booking.contact_mobile) {
    await client.query(
      `INSERT INTO email_outbox (event_type, recipient, template_data, status)
       VALUES ($1,$2,$3,'pending')`,
      ['ticket_whatsapp', booking.contact_mobile, JSON.stringify({ bookingReference: booking.booking_reference })]);
  }

  await client.query('INSERT INTO audit_logs (actor_id, action, entity_type, entity_id) VALUES ($1,$2,$3,$4)',
    [null, 'booking_confirmed', 'booking', bookingId]);

  return booking;
}

export async function createPaymentOrder({ bookingReference, provider, userId, sessionRef }) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE booking_reference=$1', [bookingReference]);
  if (!rows.length) throw notFound('booking not found');
  const booking = rows[0];
  if (booking.status !== 'pending') throw badRequest('booking not payable');
  await assertBookingAccess(pool, booking, { userId, sessionRef });
  const requested = env.ALLOW_PROVIDER_OVERRIDE ? (provider || env.PAYMENT_PROVIDER) : env.PAYMENT_PROVIDER;
  if (!['mock', 'youpi'].includes(requested)) throw badRequest('unsupported payment provider');
  const orderId = `order_${randomToken(8)}`;
  const { rows: pays } = await pool.query(
    `INSERT INTO payments (booking_id, provider, provider_order_id, amount_minor, currency, status)
     VALUES ($1,$2,$3,$4,$5,'created') RETURNING *`,
    [booking.id, requested, orderId, booking.total_minor, booking.currency]);
  return { payment: pays[0], orderId, amount: booking.total_minor, currency: booking.currency, provider: requested };
}

/**
 * A payment order is a booking-scoped write. The caller must own the booking
 * account or present the guest session that created the hold.
 */
async function assertBookingAccess(db, booking, { userId, sessionRef }) {
  if (booking.user_id) {
    if (!userId || booking.user_id !== userId) throw forbidden('not the booking owner');
    return;
  }
  if (!sessionRef) throw forbidden('guest session reference required');
  const { rows } = await db.query('SELECT session_ref FROM seat_holds WHERE id=$1', [booking.hold_id]);
  if (!rows.length || !rows[0].session_ref || rows[0].session_ref !== sessionRef) {
    throw forbidden('not the booking owner');
  }
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
  const orderId = payload.orderId || payload.providerOrderId || null;

  // A payment event must match a real payment row for this provider and booking.
  // This is the last trusted decision point before seats/tickets change.
  let payment = null;
  if (orderId) {
    const { rows } = await pool.query(
      'SELECT * FROM payments WHERE provider_order_id=$1 AND provider=$2',
      [orderId, provider],
    );
    payment = rows[0] || null;
    if (payment && payment.booking_id !== booking.id) {
      throw conflict('payment order does not belong to booking');
    }
  } else {
    const { rows } = await pool.query(
      `SELECT * FROM payments
        WHERE booking_id=$1 AND provider=$2 AND status IN ('created','verified')
        ORDER BY created_at DESC LIMIT 1`,
      [booking.id, provider],
    );
    payment = rows[0] || null;
  }
  if (!payment) throw conflict('no payable payment for this booking');

  if (!success) {
    await pool.query(
      "UPDATE payments SET status='failed', updated_at=now() WHERE id=$1 AND status IN ('created','verified')",
      [payment.id],
    );
    await pool.query("UPDATE payment_events SET processing_status='processed', processed_at=now() WHERE id=$1", [eventId]);
    return { success: false };
  }

  if (!['created', 'verified', 'failed'].includes(payment.status)) {
    throw conflict(`payment is ${payment.status}`);
  }

  const updated = await pool.query(
    `UPDATE payments
        SET status='verified', provider_payment_id=COALESCE($2, provider_payment_id),
            verified_at=now(), updated_at=now()
      WHERE id=$1 AND status IN ('created','verified','failed')
      RETURNING *`,
    [payment.id, payload.paymentId || payload.providerPaymentId || null],
  );
  if (!updated.rows.length) throw conflict('payment could not be verified');

  try {
    await withTransaction(async (client) => {
      // idempotent conversion
      await confirmBookingAfterPayment(client, booking.id, payment.id);
    });
  } catch (e) {
    console.error('[payments] confirmBookingAfterPayment failed:', e.message, e.stack);
    // if seats unavailable, mark for refund
    await pool.query("UPDATE bookings SET status='failed', updated_at=now() WHERE id=$1 AND status='pending'", [booking.id]);
    await pool.query("UPDATE payments SET status='requires_refund', updated_at=now() WHERE id=$1", [payment.id]);
    // Put the captured money straight into the manual payout queue so it cannot be
    // forgotten when the confirmation loses the seat race.
    await pool.query(
      `INSERT INTO refunds (payment_id, booking_id, amount_minor, reason, provider, method, status)
       VALUES ($1,$2,$3,'Seat no longer available after payment',$4,'upi','pending')
       ON CONFLICT DO NOTHING`,
      [payment.id, booking.id, payment.amount_minor, payment.provider || provider]);
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

const youpiApi = () => {
  const configured = (env.YOUPI_API_URL || '').replace(/\/$/, '');
  if (configured) return configured;
  // On Workers the embedded gateway cannot exist: loopback is not reachable, so an
  // unset URL is a deployment mistake, not a "not found".
  if (IS_WORKERS) {
    throw serviceUnavailable(
      'payment gateway is not configured on this deployment: set YOUPI_API_URL to the Node host (for example https://your-service.onrender.com/youpi)',
    );
  }
  return 'http://127.0.0.1:6100';
};

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

/**
 * Every open YOUPI checkout gets a unique paise value (₹0.01–₹0.99) added to the
 * booking total. The SMS observer only sees the amount, so this is what lets the
 * gateway route a credit to the exact booking even when two users pay in the same
 * second or one payment arrives before its queued session becomes active.
 *
 * Uniqueness is scoped to open/recently-verified payments: abandoned orders free
 * their amount again after 15 minutes.
 */
const VERIFICATION_OFFSET_MAX_MINOR = 99;

async function allocatePayableMinor(client, baseMinor) {
  const base = Number(baseMinor || 0);
  // Serialise allocation across API instances so two orders can never pick the
  // same paise offset for the same base amount.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('youpi-payable-amount'))");
  const holdMinutes = Number(env.YOUPI_AMOUNT_HOLD_MINUTES || 60);
  const { rows } = await client.query(
    `SELECT amount_minor FROM payments
     WHERE (status = 'created' AND created_at > now() - ($1::int * interval '1 minute'))
        OR (status = 'verified' AND verified_at > now() - ($1::int * interval '1 minute'))
        OR (status IN ('failed', 'requires_refund') AND updated_at > now() - ($1::int * interval '1 minute'))`,
    [holdMinutes]
  );
  const used = new Set(rows.map((row) => Number(row.amount_minor)));
  if (used.has(base)) {
    // The gateway may have opened a session on the base amount already.
    throw conflict('every payable amount for this total is reserved; retry shortly');
  }

  for (let offset = 1; offset <= VERIFICATION_OFFSET_MAX_MINOR; offset += 1) {
    const candidate = base + offset;
    if (!used.has(candidate)) return { payableMinor: candidate, offsetMinor: offset };
  }

  // Never reuse an amount: the gateway routes credits by exact amount.
  throw conflict('too many open payments for this total; retry shortly');
}

/** Create a YOUPI payment session for a pending booking. */
export async function createYoupiOrder({ bookingReference, customer, publicBase, userId, sessionRef }) {
  const orderId = `order_${randomToken(8)}`;

  // Allocate the payable amount and reserve the local payment row atomically. The
  // booking row lock and the allocator advisory lock keep concurrent orders from
  // choosing the same amount.
  const { booking, payment, payableMinor, offsetMinor } = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM bookings WHERE booking_reference=$1 FOR UPDATE', [bookingReference]);
    if (!rows.length) throw notFound('booking not found');
    const bookingRow = rows[0];
    if (bookingRow.status !== 'pending') throw badRequest('booking not payable');
    await assertBookingAccess(client, bookingRow, { userId, sessionRef });

    const allocation = await allocatePayableMinor(client, bookingRow.total_minor);
    const { rows: pays } = await client.query(
      `INSERT INTO payments (booking_id, provider, provider_order_id, amount_minor, currency, status)
       VALUES ($1,'youpi',$2,$3,$4,'created') RETURNING *`,
      [bookingRow.id, orderId, allocation.payableMinor, bookingRow.currency || 'INR']);

    return {
      booking: bookingRow,
      payment: pays[0],
      payableMinor: allocation.payableMinor,
      offsetMinor: allocation.offsetMinor,
    };
  });

  const amount = toRupees(payableMinor);
  // The confirmation page belongs to the customer SPA, which may live on a different
  // origin than this API (for example a Vercel client talking to a Render API). Prefer
  // APP_BASE_URL for that redirect; publicBase is only a same-origin fallback.
  const appOrigin = (env.APP_BASE_URL || publicBase || '').replace(/\/$/, '');
  // A guest has no session cookie/JWT, so the confirmation link carries a signed
  // token that only proves possession of the booking reference.
  const guestToken = booking.user_id ? '' : guestTokenForReference(booking.booking_reference);
  const returnUrl = `${appOrigin}/booking/${booking.booking_reference}${guestToken ? `?token=${encodeURIComponent(guestToken)}` : ''}`;
  // A signed-in payer's identity comes from the account, never from the request
  // body; a guest's prefill fields are only used by the gateway's OTP flow.
  let payer = customer;
  if (userId) {
    const { rows: profile } = await pool.query(
      'SELECT email, mobile, display_name FROM users WHERE id=$1',
      [userId],
    );
    if (profile[0]) {
      payer = {
        name: profile[0].display_name || '',
        email: profile[0].email || '',
        mobile: profile[0].mobile || '',
      };
    }
  }
  const merchantCustomer = payer && (payer.name || payer.email || payer.mobile)
    ? { name: payer.name || '', email: payer.email || '', phone: payer.mobile || '' }
    : null;
  // Only a caller we actually authenticated may skip the gateway's OTP step.
  const merchantVerified = Boolean(userId);

  let session;
  try {
    const res = await fetch(`${youpiApi()}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.YOUPI_MERCHANT_ID ? { 'X-Merchant-Id': env.YOUPI_MERCHANT_ID } : {}),
        ...(env.YOUPI_WEBHOOK_SECRET ? { 'X-Merchant-Key': env.YOUPI_WEBHOOK_SECRET } : {}),
        'Idempotency-Key': orderId,
      },
      body: JSON.stringify({
        orderId,
        amount,
        currency: booking.currency || 'INR',
        description: `Konkani Samudai booking ${booking.booking_reference}`,
        returnUrl,
        // The movie app has already created the booking and identified the
        // customer. Activate the UPI slot immediately so the checkout page can
        // show a payable QR and the SMS observer can match the credit. Without
        // this the session stays INITIATED and every payment waits forever.
        autoActivate: true,
        customer: payer && (payer.email || payer.mobile || payer.name)
        ? { email: payer.email, phoneNumber: payer.mobile, fullName: payer.name }
          : undefined,
        metadata: {
          bookingReference: booking.booking_reference,
          bookingId: booking.id,
          skipCustomerAuth: merchantVerified,
          ...(merchantCustomer ? { merchantCustomer } : {}),
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      await pool.query("UPDATE payments SET status='failed', updated_at=now() WHERE id=$1", [payment.id]);
      throw badRequest(body.error || body.message || `youpi create payment failed (${res.status})`);
    }
    session = body;
  } catch (e) {
    await pool.query("UPDATE payments SET status='failed', updated_at=now() WHERE id=$1", [payment.id]);
    // HttpError = the gateway answered and rejected it; anything else is transport.
    if (e && e.status) throw e;
    console.error('[youpi] gateway unreachable:', env.YOUPI_API_URL, e?.message || e);
    throw serviceUnavailable('payment gateway is unreachable — check YOUPI_API_URL');
  }

  if (session.paymentId) {
    await pool.query('UPDATE payments SET provider_payment_id=$1, updated_at=now() WHERE id=$2', [session.paymentId, payment.id]);
  }

  // The gateway is reachable through this server's own port, so the browser always
  // talks to a single origin. Do not append customer identity or a bearer token to
  // the URL: query strings leak through history, logs, and referrers.
  const base = (publicBase || '').replace(/\/$/, '');
  const checkoutUrl = `${base}/checkout/${session.paymentId}`;

  return {
    payment,
    orderId,
    amount,
    amountMinor: payableMinor,
    // Kept separate for receipts and reconciliation: the ticket still costs the
    // booking total, while amountMinor is the exact UPI amount to pay.
    baseAmountMinor: Number(booking.total_minor),
    verificationOffsetMinor: offsetMinor,
    currency: booking.currency || 'INR',
    provider: 'youpi',
    paymentId: session.paymentId,
    checkoutUrl,
    scriptUrl: `${base}/youpi.js?v=3`,
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

  // Community event passes have no booking row: settle them directly.
  const communityOrderId = payload.metadata?.communityOrderId;
  if (communityOrderId) {
    if (isSuccess) {
      await pool.query(
        `UPDATE community_ticket_orders
            SET status='paid', utr=coalesce($2, utr), updated_at=now()
          WHERE provider_order_id=$1`,
        [communityOrderId, payload.utr || null],
      );
    }
    return { received: true, community: true, status: isSuccess ? 'paid' : 'failed' };
  }

  // Memberships have their own checkout and activate the member on success.
  const membershipOrderId = payload.metadata?.membershipOrderId;
  if (membershipOrderId) {
    if (isSuccess) {
      await pool.query(
        `WITH settled AS (
           UPDATE community_membership_orders
              SET status='paid', utr=coalesce($2, utr), updated_at=now()
            WHERE provider_order_id=$1
            RETURNING *
         )
         INSERT INTO community_members
           (user_id, name, email, phone, plan, amount_minor, status, gender, age, dob, marital_status)
         SELECT user_id, name, email, phone, 'annual', base_amount_minor, 'active',
                gender, age, dob, marital_status
           FROM settled WHERE user_id IS NOT NULL
         ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO UPDATE
           SET status='active', plan='annual', amount_minor=EXCLUDED.amount_minor,
               name=coalesce(EXCLUDED.name, community_members.name),
               phone=coalesce(EXCLUDED.phone, community_members.phone),
               gender=coalesce(EXCLUDED.gender, community_members.gender),
               age=coalesce(EXCLUDED.age, community_members.age),
               dob=coalesce(EXCLUDED.dob, community_members.dob),
               marital_status=coalesce(EXCLUDED.marital_status, community_members.marital_status),
               updated_at=now()`,
        [membershipOrderId, payload.utr || null],
      );
    }
    return { received: true, membership: true, status: isSuccess ? 'paid' : 'failed' };
  }

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

/**
 * Create a YOUPI checkout session that is not tied to a movie booking (community
 * event passes). The caller stores the returned payment id on its own row.
 */
export async function createYoupiSession({
  orderId,
  amountMinor,
  currency = 'INR',
  description,
  returnUrl,
  metadata,
  customer,
  verifiedCustomer = false,
}) {
  const gateway = youpiApi();
  const merchantCustomer = customer && (customer.fullName || customer.email || customer.phone)
    ? { name: customer.fullName || '', email: customer.email || '', phone: customer.phone || '' }
    : null;
  const sessionMetadata = {
    ...(metadata || {}),
    // Only skip the gateway OTP when the caller's identity was actually verified
    // by an authenticated session, never merely because contact fields were sent.
    skipCustomerAuth: Boolean(verifiedCustomer),
    ...(merchantCustomer ? { merchantCustomer } : {}),
  };
  let res;
  try {
    res = await fetch(`${gateway}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.YOUPI_MERCHANT_ID ? { 'X-Merchant-Id': env.YOUPI_MERCHANT_ID } : {}),
        ...(env.YOUPI_WEBHOOK_SECRET ? { 'X-Merchant-Key': env.YOUPI_WEBHOOK_SECRET } : {}),
        'Idempotency-Key': orderId,
      },
      body: JSON.stringify({
        orderId,
        amount: toRupees(amountMinor),
        currency,
        description,
        returnUrl,
        customer: customer && (customer.email || customer.phone || customer.fullName)
          ? { email: customer.email, phoneNumber: customer.phone, fullName: customer.fullName }
          : undefined,
        metadata: sessionMetadata,
      }),
    });
  } catch (e) {
    console.error('[youpi] gateway unreachable:', gateway, e?.message || e);
    throw serviceUnavailable('payment gateway is unreachable — check YOUPI_API_URL');
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw badRequest(body.error || body.message || `youpi create payment failed (${res.status})`);
  }

  // The gateway builds its checkout URL from merchant branding, which may still say
  // "localhost" on a hosted deployment. Force the public portal origin; identity is
  // carried in metadata, never in the URL.
  const portalBase = (env.YOUPI_PUBLIC_BASE_URL || youpiApi().replace(/\/youpi\/?$/, ''))
    .replace(/\/+$/, '');
  if (body.paymentId && portalBase) {
    body.checkoutUrl = `${portalBase}/checkout/${body.paymentId}`;
  }

  return body;
}

/** Poll YOUPI for the authoritative status of a payment session. */
export async function getYoupiStatus(paymentId, { publicOnly = false } = {}) {
  const gatewayBase = youpiApi();
  let res;
  try {
    res = await fetch(`${gatewayBase}/api/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: {
        ...(env.YOUPI_MERCHANT_ID ? { 'X-Merchant-Id': env.YOUPI_MERCHANT_ID } : {}),
        // Only the server-to-server confirmation needs the merchant-private view.
        // A public status poll must not borrow the merchant credential.
        ...(!publicOnly && env.YOUPI_WEBHOOK_SECRET ? { 'X-Merchant-Key': env.YOUPI_WEBHOOK_SECRET } : {}),
      },
    });
  } catch (e) {
    if (e && e.status) throw e;
    console.error('[youpi] gateway unreachable:', gatewayBase, e?.message || e);
    throw serviceUnavailable('payment gateway is unreachable — check YOUPI_API_URL');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw notFound('youpi payment not found');
  if (!publicOnly) return body;
  // The browser only needs the public status fields. Never relay merchant metadata
  // (booking id/reference, customer email/phone, return URL) to an unauthenticated
  // caller that merely knows a payment id.
  return {
    status: body.status,
    amountPaise: body.amountPaise,
    currency: body.currency,
    expiresAt: body.expiresAt,
  };
}

/**
 * Client-side success callback: re-check the status with the gateway and only
 * then confirm the booking (never trust the browser alone).
 */
export async function confirmYoupiPayment({ orderId, utr, amountPaise }) {
  const { rows } = await pool.query('SELECT * FROM payments WHERE provider_order_id=$1 AND provider=$2', [orderId, 'youpi']);
  if (!rows.length) throw notFound('payment order not found');
  const payment = rows[0];
  if (!payment.provider_payment_id) {
    throw badRequest('this payment has no gateway session yet');
  }
  const { rows: bk } = await pool.query('SELECT booking_reference FROM bookings WHERE id=$1', [payment.booking_id]);
  const bookingReference = bk[0]?.booking_reference;

  const status = await getYoupiStatus(payment.provider_payment_id);
  if (status.status !== 'SUCCESS') {
    return { success: false, status: status.status };
  }
  // The gateway session amount is the unique payable amount stored on our row.
  const expectedAmount = Number(payment.amount_minor);
  if (!status.amountPaise || Number(status.amountPaise) !== expectedAmount) {
    throw badRequest('payment amount mismatch');
  }
  if (amountPaise !== undefined && Number(amountPaise) !== expectedAmount) {
    throw badRequest('payment amount mismatch');
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
      amountPaise: amountPaise ?? expectedAmount,
      status: 'success',
    },
  });
  return { success: true, result };
}
