import { pool, withTransaction } from '../../db/pool.js';
import { badRequest, notFound, conflict, forbidden } from '../../utils/errors.js';
import { randomReference } from '../../utils/crypto.js';
import { quoteCancellation, cancellationPolicy } from './refund-policy.js';

const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'];
const REFUND_STATUSES = ['pending', 'processing', 'completed', 'failed'];

function minor(value) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function clampRefund(value, paidMinor) {
  return Math.min(minor(value), minor(paidMinor));
}

async function audit(client, actorId, action, entityType, entityId, metadata = null) {
  await client.query(
    'INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,$5)',
    [actorId || null, action, entityType, entityId ? String(entityId) : null, metadata],
  );
}

/** Sum of payments the gateway has actually captured for a booking. */
async function getPaidMinor(db, bookingId) {
  const { rows } = await db.query(
    "SELECT COALESCE(SUM(amount_minor),0)::int AS paid_minor FROM payments WHERE booking_id=$1 AND status='verified'",
    [bookingId],
  );
  return Number(rows[0]?.paid_minor || 0);
}

async function getVerifiedPayments(client, bookingId) {
  const { rows } = await client.query(
    `SELECT * FROM payments
      WHERE booking_id=$1 AND status='verified'
      ORDER BY verified_at NULLS LAST, created_at`,
    [bookingId],
  );
  return rows;
}

/** Queue customer-facing email/WhatsApp without blocking the transaction on delivery. */
async function queueNotice(client, booking, { eventType, message }) {
  if (booking.contact_email) {
    await client.query(
      `INSERT INTO email_outbox (event_type, recipient, template_data, status)
       VALUES ($1,$2,$3,'pending')`,
      [eventType, booking.contact_email, JSON.stringify({
        bookingReference: booking.booking_reference,
        message,
      })],
    );
  }
  if (booking.contact_mobile) {
    await client.query(
      `INSERT INTO email_outbox (event_type, recipient, template_data, status)
       VALUES ('cancellation_whatsapp',$1,$2,'pending')`,
      [booking.contact_mobile, JSON.stringify({
        bookingReference: booking.booking_reference,
        message,
      })],
    );
  }
}

/**
 * Split a refund across the captured payments for a booking.
 *
 * There is normally exactly one verified payment, but a retried checkout can leave
 * more than one. The largest-remainder split keeps the sum exact in minor units.
 */
async function insertRefundRows(client, {
  booking,
  payments,
  refundMinor,
  policyPercent,
  reason,
  actorId,
}) {
  const totalPaid = payments.reduce((sum, p) => sum + minor(p.amount_minor), 0);
  const target = clampRefund(refundMinor, totalPaid);
  if (target <= 0 || !payments.length) return [];

  // Largest-remainder split so the sum of refund rows equals `target` exactly.
  const parts = payments.map((payment) => {
    const exact = (target * minor(payment.amount_minor)) / Math.max(1, totalPaid);
    return { payment, amount: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let remainder = target - parts.reduce((sum, part) => sum + part.amount, 0);
  for (const part of [...parts].sort((a, b) => b.fraction - a.fraction)) {
    if (remainder <= 0) break;
    part.amount += 1;
    remainder -= 1;
  }

  const created = [];
  for (const { payment, amount } of parts) {
    if (amount <= 0) continue;
    const { rows } = await client.query(
      `INSERT INTO refunds
         (payment_id, booking_id, amount_minor, reason, provider, method, policy_percent, status, initiated_by)
       VALUES ($1,$2,$3,$4,$5,'upi',$6,'pending',$7)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [payment.id, booking.id, amount, reason || 'Booking cancelled', payment.provider || null, policyPercent ?? null, actorId || null],
    );
    if (rows.length) created.push(rows[0]);
  }
  return created;
}

/**
 * Cancel a locked booking, release its seats/tickets and open the refund entries.
 * Callers are responsible for the surrounding transaction and for locking the row.
 */
async function finalizeCancellation(client, {
  booking,
  actorId = null,
  reason = null,
  policyPercent = null,
  refundMinor = null,
  source = 'admin',
}) {
  const { rows: lockedRows } = await client.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [booking.id]);
  if (!lockedRows.length) throw notFound('booking not found');
  const current = lockedRows[0];
  const paidMinor = await getPaidMinor(client, current.id);

  if (current.status === 'cancelled') {
    const { rows: refunds } = await client.query(
      'SELECT * FROM refunds WHERE booking_id=$1 ORDER BY created_at',
      [current.id],
    );
    return {
      booking: current,
      paidMinor,
      refundMinor: refunds.reduce((sum, row) => sum + minor(row.amount_minor), 0),
      policyPercent,
      refunds,
      alreadyCancelled: true,
    };
  }

  if (!['pending', 'confirmed'].includes(current.status)) {
    throw badRequest(`a ${current.status} booking cannot be cancelled`);
  }

  const { rows: tickets } = await client.query(
    'SELECT id, status, checked_in_at FROM tickets WHERE booking_id=$1 FOR UPDATE',
    [current.id],
  );
  if (tickets.some((ticket) => ticket.checked_in_at || ticket.status === 'checked_in')) {
    throw conflict('a checked-in ticket cannot be cancelled');
  }

  const refundTarget = clampRefund(
    refundMinor ?? (current.status === 'confirmed' ? paidMinor : 0),
    paidMinor,
  );

  await client.query(
    `UPDATE bookings
        SET status='cancelled', cancelled_at=now(), cancellation_reason=$2,
            cancelled_by=$3, updated_at=now()
      WHERE id=$1`,
    [current.id, reason || null, actorId || null],
  );
  await client.query(
    `UPDATE show_seats
        SET status='available', hold_id=NULL, booking_id=NULL, updated_at=now()
      WHERE booking_id=$1 OR (hold_id IS NOT NULL AND hold_id=$2::uuid)`,
    [current.id, current.hold_id],
  );
  await client.query("UPDATE tickets SET status='cancelled' WHERE booking_id=$1", [current.id]);
  if (current.hold_id) {
    await client.query(
      "UPDATE seat_holds SET status='released', released_at=now() WHERE id=$1 AND status='active'",
      [current.hold_id],
    );
  }

  const payments = await getVerifiedPayments(client, current.id);
  const refunds = await insertRefundRows(client, {
    booking: current,
    payments,
    refundMinor: refundTarget,
    policyPercent,
    reason: reason || 'Booking cancelled',
    actorId,
  });

  await audit(client, actorId, 'booking_cancelled', 'booking', current.id, {
    source,
    reason: reason || null,
    paidMinor,
    refundMinor: refundTarget,
    policyPercent,
  });

  const refundMessage = refundTarget > 0
    ? ` A refund of ₹${(refundTarget / 100).toFixed(2)} is queued and will be paid to your UPI account.`
    : '';
  await queueNotice(client, current, {
    eventType: 'booking_cancelled',
    message: `Booking ${current.booking_reference} has been cancelled.${refundMessage}`,
  });

  return {
    booking: { ...current, status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: reason || null },
    paidMinor,
    refundMinor: refundTarget,
    policyPercent,
    refunds,
    alreadyCancelled: false,
  };
}

export async function createBooking({ holdId, userId, sessionRef, contactEmail, contactMobile }) {
  return withTransaction(async (client) => {
    const { rows: holds } = await client.query('SELECT * FROM seat_holds WHERE id=$1 FOR UPDATE', [holdId]);
    if (!holds.length) throw notFound('hold not found');
    const hold = holds[0];
    if (hold.status !== 'active') throw badRequest('hold not active');
    if (new Date(hold.expires_at) <= new Date()) throw badRequest('hold expired');
    if (hold.owner_user_id && hold.owner_user_id !== userId) throw forbidden('not owner');
    if (!hold.owner_user_id && hold.session_ref && hold.session_ref !== sessionRef) throw forbidden('not owner');

    // Serialize booking creation per hold to prevent duplicates.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [holdId]);

    // Idempotent: return existing booking if one was already created.
    const { rows: existingBookings } = await client.query('SELECT * FROM bookings WHERE hold_id=$1', [holdId]);
    if (existingBookings.length) return existingBookings[0];

    // Lock the show to prevent venue changes during booking.
    await client.query('SELECT * FROM shows WHERE id=$1 FOR SHARE', [hold.show_id]);

    // Verify the seats are still held by this hold.
    const heldSeats = await client.query('SELECT id FROM show_seats WHERE hold_id=$1 FOR UPDATE', [holdId]);
    if (!heldSeats.rows.length) throw conflict('hold no longer holds any seats');

    const items = await client.query(
      `SELECT shi.show_seat_id, ss.price_minor, ss.currency, ss.seat_id
       FROM seat_hold_items shi JOIN show_seats ss ON ss.id=shi.show_seat_id
       WHERE shi.hold_id=$1`, [holdId]);
    if (!items.rows.length) throw badRequest('empty hold');

    // Ensure all hold items are still held by this hold.
    for (const it of items.rows) {
      if (!heldSeats.rows.some((hs) => hs.id === it.show_seat_id)) {
        throw conflict('seat no longer held by this hold');
      }
    }

    const showId = hold.show_id;
    const show = await client.query('SELECT * FROM shows WHERE id=$1', [showId]);
    if (!show.rows.length) throw notFound('show not found');

    // price snapshot
    let subtotal = 0;
    for (const it of items.rows) subtotal += it.price_minor || 0;
    const fees = 0;
    const tax = 0;
    const total = subtotal + fees + tax;

    const ref = randomReference('BK');
    const bookingRes = await client.query(
      `INSERT INTO bookings (booking_reference, user_id, guest_customer_id, show_id, status, subtotal_minor, fees_minor, tax_minor, total_minor, currency, contact_email, contact_mobile, hold_id)
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [ref, userId || null, hold.guest_customer_id, showId, subtotal, fees, tax, total, 'INR', contactEmail || null, contactMobile || null, holdId]);
    const booking = bookingRes.rows[0];

    for (const it of items.rows) {
      const seatInfo = await client.query(
        `SELECT s.row_label, s.seat_number, sc.name AS category_name
         FROM seats s LEFT JOIN seat_categories sc ON sc.id=s.category_id WHERE s.id=$1`, [it.seat_id]);
      const si = seatInfo.rows[0];
      const label = `${si.row_label}${si.seat_number}`;
      await client.query(
        `INSERT INTO booking_seats (booking_id, show_seat_id, seat_label, category_name, price_minor, currency)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [booking.id, it.show_seat_id, label, si.category_name, it.price_minor, it.currency]);
    }

    return booking;
  });
}

async function loadBookingExtras(db, bookingId) {
  const [{ rows: requests }, { rows: refunds }, paidMinor] = await Promise.all([
    db.query(
      `SELECT id, status, reason, policy_percent, paid_minor, refund_minor,
              review_note, reviewed_at, created_at, updated_at
         FROM booking_cancellation_requests
        WHERE booking_id=$1
        ORDER BY created_at DESC
        LIMIT 1`,
      [bookingId],
    ),
    db.query(
      `SELECT id, amount_minor, status, utr, note, method, policy_percent,
              processed_at, created_at
         FROM refunds
        WHERE booking_id=$1
        ORDER BY created_at`,
      [bookingId],
    ),
    getPaidMinor(db, bookingId),
  ]);
  return {
    cancellation: requests[0] || null,
    refunds,
    paid_minor: paidMinor,
    refundable_minor: refunds.reduce((sum, row) => sum + minor(row.amount_minor), 0),
  };
}

export async function getBooking(reference, user) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE booking_reference=$1', [reference]);
  if (!rows.length) throw notFound('booking not found');
  const booking = rows[0];
  if (user && booking.user_id && booking.user_id !== user.id) throw forbidden();
  if (!user && booking.user_id) throw forbidden();
  const seats = await pool.query('SELECT * FROM booking_seats WHERE booking_id=$1', [booking.id]);
  const tickets = await pool.query('SELECT id, ticket_reference, status, checked_in_at FROM tickets WHERE booking_id=$1', [booking.id]);
  const extras = await loadBookingExtras(pool, booking.id);
  return { ...booking, seats: seats.rows, tickets: tickets.rows, ...extras };
}

export async function listMyTickets(userId) {
  const { rows } = await pool.query(
    `SELECT b.*, s.starts_at, s.ends_at,
            m.title, m.slug AS movie_slug, m.certification, m.duration_minutes, m.language, m.genre,
            (SELECT url FROM movie_media WHERE movie_id=m.id AND media_type='poster' ORDER BY display_order LIMIT 1) AS thumbnail_url,
            a.name AS auditorium_name, t.name AS theatre_name, t.address AS theatre_address,
            COALESCE((
              SELECT json_agg(
                       json_build_object(
                         'seat_label', bs.seat_label,
                         'category_name', bs.category_name,
                         'price_minor', bs.price_minor,
                         'ticket_id', tk.id,
                         'ticket_reference', tk.ticket_reference,
                         'ticket_status', tk.status,
                         'checked_in_at', tk.checked_in_at
                       ) ORDER BY bs.seat_label)
              FROM booking_seats bs
              LEFT JOIN tickets tk ON tk.booking_seat_id = bs.id
              WHERE bs.booking_id = b.id
            ), '[]'::json) AS seats,
            (SELECT COALESCE(SUM(p.amount_minor),0)::int FROM payments p WHERE p.booking_id=b.id AND p.status='verified') AS paid_minor,
            (SELECT json_build_object(
                      'id', cr.id,
                      'status', cr.status,
                      'reason', cr.reason,
                      'policy_percent', cr.policy_percent,
                      'refund_minor', cr.refund_minor,
                      'review_note', cr.review_note,
                      'created_at', cr.created_at,
                      'reviewed_at', cr.reviewed_at)
               FROM booking_cancellation_requests cr
              WHERE cr.booking_id=b.id
              ORDER BY cr.created_at DESC
              LIMIT 1) AS cancellation,
            (SELECT COALESCE(json_agg(
                      json_build_object(
                        'id', rf.id,
                        'amount_minor', rf.amount_minor,
                        'status', rf.status,
                        'utr', rf.utr,
                        'created_at', rf.created_at,
                        'processed_at', rf.processed_at
                      ) ORDER BY rf.created_at
                    ), '[]'::json)
               FROM refunds rf
              WHERE rf.booking_id=b.id) AS refunds
     FROM bookings b
     JOIN shows s ON s.id=b.show_id
     JOIN movies m ON m.id=s.movie_id
     JOIN auditoriums a ON a.id=s.auditorium_id
     JOIN theatres t ON t.id=a.theatre_id
     WHERE b.user_id=$1 AND b.status <> 'pending'
     ORDER BY s.starts_at DESC`, [userId]);
  return rows;
}

/* ---------------------------------------------------------------------------
 * Customer cancellation requests
 * ------------------------------------------------------------------------- */

export async function getCancellationQuote(reference, user) {
  const { rows } = await pool.query(
    `SELECT b.*, s.starts_at FROM bookings b JOIN shows s ON s.id=b.show_id WHERE b.booking_reference=$1`,
    [reference],
  );
  if (!rows.length) throw notFound('booking not found');
  const booking = rows[0];
  if (!user || booking.user_id !== user.id) throw forbidden('not owner');

  const paidMinor = await getPaidMinor(pool, booking.id);
  const extras = await loadBookingExtras(pool, booking.id);
  return {
    booking_reference: booking.booking_reference,
    booking_status: booking.status,
    starts_at: booking.starts_at,
    total_minor: booking.total_minor,
    paid_minor: paidMinor,
    quote: quoteCancellation({
      startsAt: booking.starts_at,
      paidMinor,
      totalMinor: booking.total_minor,
    }),
    cancellation: extras.cancellation,
    refunds: extras.refunds,
    policy: cancellationPolicy(),
  };
}

export async function requestCancellation({ reference, userId, reason }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT b.*, s.starts_at
         FROM bookings b JOIN shows s ON s.id=b.show_id
        WHERE b.booking_reference=$1
        FOR UPDATE OF b`,
      [reference],
    );
    if (!rows.length) throw notFound('booking not found');
    const booking = rows[0];
    if (booking.user_id !== userId) throw forbidden('not owner');

    const existing = await client.query(
      `SELECT * FROM booking_cancellation_requests
        WHERE booking_id=$1 AND status='pending'
        ORDER BY created_at DESC LIMIT 1
        FOR UPDATE`,
      [booking.id],
    );

    if (booking.status === 'cancelled') {
      const extras = await loadBookingExtras(client, booking.id);
      return {
        mode: 'cancelled',
        booking: { ...booking, status: 'cancelled' },
        cancellation: extras.cancellation,
        refunds: extras.refunds,
        paid_minor: extras.paid_minor,
      };
    }

    // An unpaid booking has nothing to refund: release it immediately.
    if (booking.status === 'pending') {
      const result = await finalizeCancellation(client, {
        booking,
        actorId: userId,
        reason: reason || 'Cancelled by customer before payment',
        policyPercent: 0,
        refundMinor: 0,
        source: 'customer',
      });
      return {
        mode: 'cancelled',
        booking: result.booking,
        cancellation: null,
        refunds: [],
        paid_minor: 0,
      };
    }

    if (booking.status !== 'confirmed') {
      throw badRequest(`a ${booking.status} booking cannot be cancelled`);
    }

    if (existing.rows.length) {
      const paidMinor = await getPaidMinor(client, booking.id);
      return {
        mode: 'request',
        request: existing.rows[0],
        quote: quoteCancellation({
          startsAt: booking.starts_at,
          paidMinor,
          totalMinor: booking.total_minor,
        }),
      };
    }

    const { rows: tickets } = await client.query(
      'SELECT id, status, checked_in_at FROM tickets WHERE booking_id=$1 FOR UPDATE',
      [booking.id],
    );
    if (tickets.some((ticket) => ticket.checked_in_at || ticket.status === 'checked_in')) {
      throw conflict('a checked-in ticket cannot be cancelled');
    }

    const paidMinor = await getPaidMinor(client, booking.id);
    const quote = quoteCancellation({
      startsAt: booking.starts_at,
      paidMinor,
      totalMinor: booking.total_minor,
    });
    if (!quote.allowed) throw badRequest(quote.reason);

    const { rows: inserted } = await client.query(
      `INSERT INTO booking_cancellation_requests
         (booking_id, requested_by, reason, status, policy_percent, paid_minor, refund_minor)
       VALUES ($1,$2,$3,'pending',$4,$5,$6)
       RETURNING *`,
      [booking.id, userId, reason || null, quote.percent, paidMinor, quote.refundMinor],
    );
    const request = inserted[0];

    await audit(client, userId, 'cancellation_requested', 'booking', booking.id, {
      requestId: request.id,
      policyPercent: quote.percent,
      refundMinor: quote.refundMinor,
      paidMinor,
    });

    await queueNotice(client, booking, {
      eventType: 'cancellation_requested',
      message: `We received your cancellation request for ${booking.booking_reference}. `
        + `If approved, ₹${(quote.refundMinor / 100).toFixed(2)} will be refunded to your UPI account.`,
    });

    return { mode: 'request', request, quote };
  });
}

/* ---------------------------------------------------------------------------
 * Admin: cancellation request review
 * ------------------------------------------------------------------------- */

export async function listCancellationRequests({ status } = {}) {
  const filter = status && REQUEST_STATUSES.includes(status) ? status : null;
  const { rows } = await pool.query(
    `SELECT r.*,
            b.booking_reference, b.status AS booking_status, b.total_minor, b.currency,
            b.contact_email, b.contact_mobile,
            s.starts_at, m.title,
            u.email AS requested_by_email,
            (SELECT COALESCE(SUM(p.amount_minor),0)::int
               FROM payments p WHERE p.booking_id=b.id AND p.status='verified') AS paid_minor
       FROM booking_cancellation_requests r
       JOIN bookings b ON b.id=r.booking_id
       JOIN shows s ON s.id=b.show_id
       JOIN movies m ON m.id=s.movie_id
       LEFT JOIN users u ON u.id=r.requested_by
      WHERE ($1::text IS NULL OR r.status=$1)
      ORDER BY (r.status='pending') DESC, r.created_at DESC
      LIMIT 200`,
    [filter],
  );
  return rows;
}

export async function approveCancellationRequest({ requestId, actorId, note, refundMinor }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM booking_cancellation_requests WHERE id=$1 FOR UPDATE',
      [requestId],
    );
    if (!rows.length) throw notFound('cancellation request not found');
    const request = rows[0];

    if (request.status === 'approved') {
      const extras = await loadBookingExtras(client, request.booking_id);
      return { request, ...extras };
    }
    if (request.status !== 'pending') {
      throw conflict(`this request was already ${request.status}`);
    }

    const { rows: bookingRows } = await client.query(
      `SELECT b.*, s.starts_at
         FROM bookings b JOIN shows s ON s.id=b.show_id
        WHERE b.id=$1
        FOR UPDATE OF b`,
      [request.booking_id],
    );
    if (!bookingRows.length) throw notFound('booking not found');
    const booking = bookingRows[0];

    if (booking.status === 'cancelled') {
      await client.query(
        `UPDATE booking_cancellation_requests
            SET status='approved', review_note=$2, reviewed_by=$3, reviewed_at=now(), updated_at=now()
          WHERE id=$1`,
        [request.id, note || 'Booking was already cancelled', actorId],
      );
      const extras = await loadBookingExtras(client, booking.id);
      return { request: { ...request, status: 'approved' }, ...extras };
    }
    if (booking.status !== 'confirmed') {
      throw badRequest(`a ${booking.status} booking cannot be cancelled`);
    }

    const paidMinor = await getPaidMinor(client, booking.id);
    const refundTarget = clampRefund(
      refundMinor ?? request.refund_minor,
      paidMinor,
    );
    const percent = refundMinor != null && paidMinor > 0
      ? Math.round((refundTarget / paidMinor) * 100)
      : Number(request.policy_percent || 0);

    const result = await finalizeCancellation(client, {
      booking,
      actorId,
      reason: request.reason || 'Customer cancellation request',
      policyPercent: percent,
      refundMinor: refundTarget,
      source: 'customer_request',
    });

    const { rows: updated } = await client.query(
      `UPDATE booking_cancellation_requests
          SET status='approved', review_note=$2, reviewed_by=$3, reviewed_at=now(),
              refund_minor=$4, policy_percent=$5, updated_at=now()
        WHERE id=$1
        RETURNING *`,
      [request.id, note || null, actorId, refundTarget, percent],
    );

    await audit(client, actorId, 'cancellation_approved', 'booking', booking.id, {
      requestId: request.id,
      refundMinor: refundTarget,
      policyPercent: percent,
    });

    return {
      request: updated[0],
      ...result,
    };
  });
}

export async function rejectCancellationRequest({ requestId, actorId, note }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM booking_cancellation_requests WHERE id=$1 FOR UPDATE',
      [requestId],
    );
    if (!rows.length) throw notFound('cancellation request not found');
    const request = rows[0];

    if (request.status === 'rejected') return request;
    if (request.status !== 'pending') {
      throw conflict(`this request was already ${request.status}`);
    }

    const { rows: updated } = await client.query(
      `UPDATE booking_cancellation_requests
          SET status='rejected', review_note=$2, reviewed_by=$3, reviewed_at=now(), updated_at=now()
        WHERE id=$1
        RETURNING *`,
      [request.id, note || null, actorId],
    );

    const { rows: bookings } = await client.query('SELECT * FROM bookings WHERE id=$1', [request.booking_id]);
    const booking = bookings[0];
    if (booking) {
      await audit(client, actorId, 'cancellation_rejected', 'booking', booking.id, {
        requestId: request.id,
        note: note || null,
      });
      await queueNotice(client, booking, {
        eventType: 'cancellation_rejected',
        message: `Your cancellation request for ${booking.booking_reference} could not be approved. `
          + `${note ? `Note from the venue: ${note}` : 'Please contact the venue for details.'} `
          + 'Your tickets are still valid.',
      });
    }

    return updated[0];
  });
}

/* ---------------------------------------------------------------------------
 * Admin: refund payout queue
 * ------------------------------------------------------------------------- */

export async function listRefunds({ status } = {}) {
  const filter = status && REFUND_STATUSES.includes(status) ? status : null;
  const { rows } = await pool.query(
    `SELECT rf.*,
            b.booking_reference, b.contact_email, b.contact_mobile, b.status AS booking_status,
            s.starts_at, m.title,
            p.provider_payment_id, p.status AS payment_status
       FROM refunds rf
       LEFT JOIN bookings b ON b.id=rf.booking_id
       LEFT JOIN shows s ON s.id=b.show_id
       LEFT JOIN movies m ON m.id=s.movie_id
       LEFT JOIN payments p ON p.id=rf.payment_id
      WHERE ($1::text IS NULL OR rf.status=$1)
      ORDER BY (rf.status IN ('pending','processing')) DESC, rf.created_at DESC
      LIMIT 200`,
    [filter],
  );
  return rows;
}

export async function updateRefund({ refundId, status, utr, note, actorId }) {
  if (!REFUND_STATUSES.includes(status)) throw badRequest('invalid refund status');
  const cleanUtr = utr ? String(utr).trim() : null;
  if (status === 'completed' && !cleanUtr) {
    throw badRequest('a UTR is required to mark a refund as completed');
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM refunds WHERE id=$1 FOR UPDATE', [refundId]);
    if (!rows.length) throw notFound('refund not found');
    const refund = rows[0];

    if (refund.status === 'completed' && status !== 'completed') {
      throw conflict('a completed refund cannot be reopened');
    }
    if (refund.status === 'completed' && status === 'completed') {
      if (cleanUtr && refund.utr && cleanUtr !== refund.utr) {
        throw conflict('this refund was already completed with a different UTR');
      }
      return refund;
    }

    const { rows: updated } = await client.query(
      `UPDATE refunds
          SET status=$2,
              utr=COALESCE($3, utr),
              note=COALESCE($4, note),
              processed_by=CASE WHEN $2='completed' THEN $5 ELSE processed_by END,
              processed_at=CASE WHEN $2='completed' THEN now() ELSE processed_at END,
              updated_at=now()
        WHERE id=$1
        RETURNING *`,
      [refund.id, status, cleanUtr, note || null, actorId || null],
    );

    const row = updated[0];
    await audit(client, actorId, `refund_${status}`, 'refund', refund.id, {
      bookingId: refund.booking_id,
      amountMinor: refund.amount_minor,
      utr: cleanUtr,
      note: note || null,
    });

    if (status === 'completed' && refund.booking_id) {
      const { rows: bookings } = await client.query('SELECT * FROM bookings WHERE id=$1', [refund.booking_id]);
      const booking = bookings[0];
      if (booking) {
        await queueNotice(client, booking, {
          eventType: 'refund_completed',
          message: `Refund of ₹${(minor(refund.amount_minor) / 100).toFixed(2)} for `
            + `${booking.booking_reference} has been sent to your UPI account. UTR: ${cleanUtr}.`,
        });
      }
    }

    return row;
  });
}

/* ---------------------------------------------------------------------------
 * Shared cancellation entry points (admin, customer, show deletion)
 * ------------------------------------------------------------------------- */

/**
 * Admin cancellation. `refundMode`:
 *  - full   (default) refund everything captured
 *  - policy apply the published tiers
 *  - custom use `refundMinor`
 */
export async function cancelBooking(bookingId, actorId, options = {}) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT b.*, s.starts_at
         FROM bookings b JOIN shows s ON s.id=b.show_id
        WHERE b.id=$1
        FOR UPDATE OF b`,
      [bookingId],
    );
    if (!rows.length) throw notFound('booking not found');
    const booking = rows[0];

    if (booking.status === 'cancelled') {
      return finalizeCancellation(client, { booking, actorId, reason: options.reason });
    }

    const paidMinor = await getPaidMinor(client, booking.id);
    let refundMinor = 0;
    let policyPercent = 0;

    if (booking.status === 'confirmed') {
      const mode = options.refundMode || 'full';
      if (mode === 'policy') {
        const quote = quoteCancellation({
          startsAt: booking.starts_at,
          paidMinor,
          totalMinor: booking.total_minor,
        });
        if (!quote.allowed) throw badRequest(quote.reason);
        refundMinor = quote.refundMinor;
        policyPercent = quote.percent;
      } else if (mode === 'custom') {
        refundMinor = clampRefund(options.refundMinor, paidMinor);
        policyPercent = paidMinor > 0 ? Math.round((refundMinor / paidMinor) * 100) : 0;
      } else {
        refundMinor = paidMinor;
        policyPercent = 100;
      }
    }

    return finalizeCancellation(client, {
      booking,
      actorId,
      reason: options.reason || 'Cancelled by the venue',
      policyPercent,
      refundMinor,
      source: options.source || 'admin',
    });
  });
}

/**
 * Cancel every active booking for a show and open full refunds. Used when a show is
 * deleted or moved to `cancelled`; runs inside the caller's transaction.
 */
export async function cancelBookingsForShow(client, showId, {
  actorId = null,
  reason = 'Show cancelled by the venue',
} = {}) {
  const { rows } = await client.query(
    `SELECT id FROM bookings WHERE show_id=$1 AND status IN ('pending','confirmed') ORDER BY created_at`,
    [showId],
  );
  const results = [];
  for (const row of rows) {
    const { rows: bookingRows } = await client.query(
      `SELECT b.*, s.starts_at
         FROM bookings b JOIN shows s ON s.id=b.show_id
        WHERE b.id=$1
        FOR UPDATE OF b`,
      [row.id],
    );
    if (!bookingRows.length) continue;
    const booking = bookingRows[0];
    const paidMinor = await getPaidMinor(client, booking.id);
    results.push(await finalizeCancellation(client, {
      booking,
      actorId,
      reason,
      policyPercent: booking.status === 'confirmed' ? 100 : 0,
      refundMinor: booking.status === 'confirmed' ? paidMinor : 0,
      source: 'show_cancelled',
    }));
  }
  return results;
}
