import { pool, withTransaction } from '../../db/pool.js';
import { badRequest, notFound, conflict, forbidden } from '../../utils/errors.js';
import { randomReference } from '../../utils/crypto.js';

export async function createBooking({ holdId, userId, sessionRef, contactEmail, contactMobile }) {
  return withTransaction(async (client) => {
    const { rows: holds } = await client.query('SELECT * FROM seat_holds WHERE id=$1 FOR UPDATE', [holdId]);
    if (!holds.length) throw notFound('hold not found');
    const hold = holds[0];
    if (hold.status !== 'active') throw badRequest('hold not active');
    if (new Date(hold.expires_at) <= new Date()) throw badRequest('hold expired');
    if (hold.owner_user_id && hold.owner_user_id !== userId) throw forbidden('not owner');
    if (!hold.owner_user_id && hold.session_ref && hold.session_ref !== sessionRef) throw forbidden('not owner');

    const items = await client.query(
      `SELECT shi.show_seat_id, ss.price_minor, ss.currency, ss.seat_id
       FROM seat_hold_items shi JOIN show_seats ss ON ss.id=shi.show_seat_id
       WHERE shi.hold_id=$1`, [holdId]);
    if (!items.rows.length) throw badRequest('empty hold');

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

export async function getBooking(reference, user) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE booking_reference=$1', [reference]);
  if (!rows.length) throw notFound('booking not found');
  const booking = rows[0];
  if (user && booking.user_id && booking.user_id !== user.id) throw forbidden();
  if (!user && booking.user_id) throw forbidden();
  const seats = await pool.query('SELECT * FROM booking_seats WHERE booking_id=$1', [booking.id]);
  const tickets = await pool.query('SELECT id, ticket_reference, status, checked_in_at FROM tickets WHERE booking_id=$1', [booking.id]);
  return { ...booking, seats: seats.rows, tickets: tickets.rows };
}

export async function listMyTickets(userId) {
  const { rows } = await pool.query(
    `SELECT b.*, s.starts_at, s.ends_at,
            m.title, m.slug AS movie_slug, m.certification, m.duration_minutes, m.language, m.genre,
            (SELECT url FROM movie_media WHERE movie_id=m.id AND media_type='poster' ORDER BY display_order LIMIT 1) AS thumbnail_url,
            a.name AS auditorium_name, t.name AS theatre_name,
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
            ), '[]'::json) AS seats
     FROM bookings b
     JOIN shows s ON s.id=b.show_id
     JOIN movies m ON m.id=s.movie_id
     JOIN auditoriums a ON a.id=s.auditorium_id
     JOIN theatres t ON t.id=a.theatre_id
     WHERE b.user_id=$1 ORDER BY s.starts_at DESC`, [userId]);
  return rows;
}

export async function cancelBooking(bookingId, actorId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId]);
    if (!rows.length) throw notFound();
    const booking = rows[0];
    if (booking.status === 'cancelled') return booking;
    if (!['pending', 'confirmed'].includes(booking.status)) throw badRequest('cannot cancel');
    await client.query("UPDATE bookings SET status='cancelled', updated_at=now() WHERE id=$1", [bookingId]);
    // release seats if pending; if confirmed, mark cancelled and optionally available. We'll mark seats available for cancelled.
    await client.query("UPDATE show_seats SET status='available', hold_id=NULL, booking_id=NULL, updated_at=now() WHERE booking_id=$1", [bookingId]);
    await client.query("UPDATE tickets SET status='cancelled' WHERE booking_id=$1", [bookingId]);
    await client.query('INSERT INTO audit_logs (actor_id, action, entity_type, entity_id) VALUES ($1,$2,$3,$4)',
      [actorId, 'booking_cancelled', 'booking', bookingId]);
    return { ...booking, status: 'cancelled' };
  });
}
