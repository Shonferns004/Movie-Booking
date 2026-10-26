import { pool, withTransaction } from '../../db/pool.js';
import { badRequest, conflict, notFound, forbidden } from '../../utils/errors.js';
import { env } from '../../config/env.js';

export async function createHold({ showId, seatIds, userId, sessionRef, guestEmail }) {
  if (!Array.isArray(seatIds) || seatIds.length === 0) throw badRequest('seatIds required');
  if (seatIds.length > env.MAX_SEATS_PER_BOOKING) throw badRequest('too many seats');
  const unique = [...new Set(seatIds)];
  if (unique.length !== seatIds.length) throw badRequest('duplicate seats');

  return withTransaction(async (client) => {
    const showRes = await client.query('SELECT * FROM shows WHERE id=$1 FOR SHARE', [showId]);
    if (!showRes.rows.length) throw notFound('show not found');
    const show = showRes.rows[0];
    if (!['scheduled', 'active'].includes(show.status)) throw badRequest('show not bookable');
    const now = new Date();
    if (now < new Date(show.booking_opens_at) || now > new Date(show.booking_closes_at)) throw badRequest('booking window closed');

    // lock show_seats
    const seatsRes = await client.query(
      `SELECT ss.*, s.seat_key, s.row_label, s.seat_number, s.category_id
       FROM show_seats ss JOIN seats s ON s.id=ss.seat_id
       WHERE ss.show_id=$1 AND ss.seat_id = ANY($2::uuid[]) AND s.auditorium_id=$3
       ORDER BY ss.id FOR UPDATE`, [showId, unique, show.auditorium_id]);
    if (seatsRes.rows.length !== unique.length) throw badRequest('invalid seats for show');

    // check availability / expired holds
    for (const ss of seatsRes.rows) {
      if (ss.status === 'booked') throw conflict('seat already booked');
      if (ss.status === 'blocked') throw conflict('seat blocked');
      if (ss.status === 'held' && ss.hold_id) {
        const h = await client.query('SELECT status, expires_at FROM seat_holds WHERE id=$1', [ss.hold_id]);
        const hold = h.rows[0];
        const expired = !hold || hold.status !== 'active' || new Date(hold.expires_at) <= now;
        if (!expired) throw conflict('seat currently held');
        // reclaim: mark hold released
        if (hold) await client.query("UPDATE seat_holds SET status='released', released_at=now() WHERE id=$1", [ss.hold_id]);
      }
    }

    // guest customer
    let guestCustomerId = null;
    if (!userId && guestEmail) {
      const g = await client.query('INSERT INTO guest_customers (email) VALUES ($1) RETURNING id', [guestEmail]);
      guestCustomerId = g.rows[0].id;
    }

    const expiresAt = new Date(now.getTime() + env.HOLD_EXPIRY_SECONDS * 1000);
    const holdRes = await client.query(
      `INSERT INTO seat_holds (show_id, owner_user_id, guest_customer_id, session_ref, status, expires_at)
       VALUES ($1,$2,$3,$4,'active',$5) RETURNING id`,
      [showId, userId || null, guestCustomerId, sessionRef || null, expiresAt.toISOString()]);
    const holdId = holdRes.rows[0].id;

    let total = 0;
    const currency = 'INR';
    for (const ss of seatsRes.rows) {
      await client.query('UPDATE show_seats SET status=$1, hold_id=$2, updated_at=now() WHERE id=$3',
        ['held', holdId, ss.id]);
      await client.query('INSERT INTO seat_hold_items (hold_id, show_seat_id) VALUES ($1,$2)', [holdId, ss.id]);
      total += ss.price_minor || 0;
    }

    return { holdId, showId, expiresAt: expiresAt.toISOString(), seatCount: unique.length, totalMinor: total, currency };
  });
}

export async function releaseHold({ holdId, userId, sessionRef }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM seat_holds WHERE id=$1 FOR UPDATE', [holdId]);
    if (!rows.length) throw notFound('hold not found');
    const hold = rows[0];
    if (hold.status !== 'active') return { released: true };
    // ownership
    if (hold.owner_user_id && hold.owner_user_id !== userId) throw forbidden('not owner');
    if (!hold.owner_user_id && hold.session_ref && hold.session_ref !== sessionRef) throw forbidden('not owner');

    await client.query("UPDATE seat_holds SET status='released', released_at=now() WHERE id=$1", [holdId]);
    await client.query("UPDATE show_seats SET status='available', hold_id=NULL, updated_at=now() WHERE hold_id=$1", [holdId]);
    return { released: true };
  });
}

export async function getHold(holdId) {
  const { rows } = await pool.query('SELECT * FROM seat_holds WHERE id=$1', [holdId]);
  if (!rows.length) throw notFound();
  return rows[0];
}
