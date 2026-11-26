import { pool, withTransaction } from '../../db/pool.js';
import { notFound, forbidden, badRequest, conflict } from '../../utils/errors.js';
import { guestTokenMatches } from '../bookings/service.js';

export async function getTicket(idOrRef, user, guestToken = null) {
  const { rows } = await pool.query('SELECT * FROM tickets WHERE id=$1 OR ticket_reference=$2', [idOrRef, idOrRef]);
  if (!rows.length) throw notFound('ticket not found');
  const ticket = rows[0];
  const booking = (await pool.query('SELECT * FROM bookings WHERE id=$1', [ticket.booking_id])).rows[0];
  if (booking.user_id) {
    if (!user || booking.user_id !== user.id) throw forbidden();
  } else if (!guestTokenMatches(booking.booking_reference, guestToken)) {
    throw forbidden();
  }
  return { ...ticket, booking };
}

export async function resendEmail(ticketId, user) {
  const { rows } = await pool.query('SELECT * FROM tickets WHERE id=$1 OR ticket_reference=$2', [ticketId, ticketId]);
  if (!rows.length) throw notFound();
  const ticket = rows[0];
  const booking = (await pool.query('SELECT * FROM bookings WHERE id=$1', [ticket.booking_id])).rows[0];
  if (!booking.user_id || !user || booking.user_id !== user.id) throw forbidden('not the booking owner');

  const recent = await pool.query(
    `SELECT 1 FROM email_outbox
      WHERE event_type='ticket_resend'
        AND template_data->>'ticketReference'=$1
        AND created_at > now() - interval '5 minutes'
      LIMIT 1`,
    [ticket.ticket_reference],
  );
  if (recent.rows.length) throw conflict('wait a few minutes before resending this ticket');

  await pool.query(`INSERT INTO email_outbox (event_type, recipient, template_data, status) VALUES ($1,$2,$3,'pending')`,
    ['ticket_resend', booking.contact_email || 'customer@movie.local', JSON.stringify({ bookingReference: booking.booking_reference, ticketReference: ticket.ticket_reference })]);
  return { queued: true };
}

export async function validateAndCheckIn({ ticketReference, showId, staffUserId, metadata }) {
  if (!showId) throw badRequest('showId is required to validate a ticket');
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM tickets WHERE ticket_reference=$1 FOR UPDATE', [ticketReference]);
    if (!rows.length) {
      await client.query('INSERT INTO ticket_scans (ticket_id, show_id, staff_user_id, result, rejection_reason, metadata) VALUES (NULL,$1,$2,$3,$4,$5)',
        [showId, staffUserId, 'INVALID', 'unknown ticket', metadata || null]);
      return { result: 'INVALID', reason: 'unknown ticket' };
    }
    const ticket = rows[0];
    const booking = (await client.query('SELECT * FROM bookings WHERE id=$1', [ticket.booking_id])).rows[0];
    const show = (await client.query('SELECT * FROM shows WHERE id=$1', [ticket ? booking.show_id : null])).rows[0];

    // verify payment
    const payments = await client.query("SELECT status FROM payments WHERE booking_id=$1", [booking.id]);
    const paymentVerified = payments.rows.some((p) => p.status === 'verified');
    if (booking.status !== 'confirmed' || !paymentVerified) {
      await recordScan(client, ticket.id, showId, staffUserId, 'INVALID', 'unpaid or unconfirmed booking', metadata);
      return { result: 'INVALID', reason: 'unpaid or unconfirmed booking' };
    }
    if (ticket.status === 'cancelled' || ticket.status === 'refunded') {
      await recordScan(client, ticket.id, showId, staffUserId, 'INVALID', 'cancelled/refunded ticket', metadata);
      return { result: 'INVALID', reason: 'cancelled/refunded ticket' };
    }
    if (!show) {
      await recordScan(client, ticket.id, showId, staffUserId, 'INVALID', 'unknown show', metadata);
      return { result: 'INVALID', reason: 'unknown show' };
    }
    if (booking.show_id !== showId) {
      await recordScan(client, ticket.id, showId, staffUserId, 'INVALID', 'wrong show', metadata);
      return { result: 'INVALID', reason: 'wrong show' };
    }
    if (!['scheduled', 'active'].includes(show.status)) {
      await recordScan(client, ticket.id, showId, staffUserId, 'INVALID', 'show is not open for admission', metadata);
      return { result: 'INVALID', reason: 'show is not open for admission' };
    }
    const now = Date.now();
    const opens = new Date(show.starts_at).getTime() - 2 * 60 * 60 * 1000;
    const closes = new Date(show.ends_at).getTime() + 2 * 60 * 60 * 1000;
    if (now < opens || now > closes) {
      await recordScan(client, ticket.id, showId, staffUserId, 'INVALID', 'outside check-in window', metadata);
      return { result: 'INVALID', reason: 'outside check-in window' };
    }
    if (ticket.checked_in_at) {
      await recordScan(client, ticket.id, showId, staffUserId, 'ALREADY_USED', 'already checked in', metadata);
      return { result: 'ALREADY_USED', checkedInAt: ticket.checked_in_at };
    }

    const upd = await client.query(
      "UPDATE tickets SET status='checked_in', checked_in_at=now(), checked_in_by=$1 WHERE id=$2 AND checked_in_at IS NULL RETURNING checked_in_at",
      [staffUserId, ticket.id]);
    if (!upd.rows.length) {
      // concurrent
      const t2 = (await client.query('SELECT checked_in_at FROM tickets WHERE id=$1', [ticket.id])).rows[0];
      await recordScan(client, ticket.id, showId, staffUserId, 'ALREADY_USED', 'already checked in', metadata);
      return { result: 'ALREADY_USED', checkedInAt: t2.checked_in_at };
    }
    await recordScan(client, ticket.id, showId, staffUserId, 'VALID', null, metadata);
    return { result: 'VALID', checkedInAt: upd.rows[0].checked_in_at };
  });
}

async function recordScan(client, ticketId, showId, staffUserId, result, reason, metadata) {
  await client.query(
    'INSERT INTO ticket_scans (ticket_id, show_id, staff_user_id, result, rejection_reason, metadata) VALUES ($1,$2,$3,$4,$5,$6)',
    [ticketId, showId, staffUserId, result, reason, metadata || null]);
}

export async function scanHistory(staffUserId, limit = 50) {
  const { rows } = await pool.query(
    'SELECT * FROM ticket_scans WHERE staff_user_id=$1 ORDER BY scanned_at DESC LIMIT $2', [staffUserId, limit]);
  return rows;
}
