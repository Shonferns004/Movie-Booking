import { pool, withTransaction } from '../../db/pool.js';
import { notFound, badRequest, conflict } from '../../utils/errors.js';

export async function listShows({ movieId, from, to } = {}) {
  const params = [];
  let where = 'WHERE 1=1';
  if (movieId) { params.push(movieId); where += ` AND movie_id=$${params.length}`; }
  if (from) { params.push(from); where += ` AND starts_at >= $${params.length}`; }
  if (to) { params.push(to); where += ` AND starts_at <= $${params.length}`; }
  const { rows } = await pool.query(`SELECT * FROM shows ${where} ORDER BY starts_at`, params);
  return rows;
}

export async function getShow(id) {
  const { rows } = await pool.query('SELECT * FROM shows WHERE id=$1', [id]);
  if (!rows.length) throw notFound('show not found');
  const show = rows[0];
  const prices = await pool.query('SELECT category_id, amount_minor FROM show_seat_prices WHERE show_id=$1', [id]);
  return { ...show, prices: prices.rows };
}

export async function createShow(data) {
  return withTransaction(async (client) => {
    // conflict check
    const conflictRes = await client.query(
      `SELECT id FROM shows WHERE auditorium_id=$1 AND status NOT IN ('cancelled')
       AND starts_at < $2 AND ends_at > $3`,
      [data.auditoriumId, data.endsAt, data.startsAt]);
    if (conflictRes.rows.length) throw conflict('auditorium already booked for overlapping time');

    const { rows } = await client.query(
      `INSERT INTO shows (movie_id, auditorium_id, starts_at, ends_at, booking_opens_at, booking_closes_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,'scheduled') RETURNING *`,
      [data.movieId, data.auditoriumId, data.startsAt, data.endsAt, data.bookingOpensAt, data.bookingClosesAt]);
    const show = rows[0];

    // prices
    for (const p of data.prices || []) {
      await client.query(
        'INSERT INTO show_seat_prices (show_id, category_id, seat_id, amount_minor, currency) VALUES ($1,$2,$3,$4,$5)',
        [show.id, p.categoryId || null, p.seatId || null, p.amountMinor, p.currency || 'INR']);
    }

    // layout version
    const aud = await client.query('SELECT active_layout_version_id FROM auditoriums WHERE id=$1', [data.auditoriumId]);
    const versionId = aud.rows[0].active_layout_version_id;
    if (!versionId) throw badRequest('auditorium has no active layout');

    const seats = await client.query('SELECT id, category_id FROM seats WHERE layout_version_id=$1', [versionId]);
    for (const s of seats.rows) {
      const priceRes = await client.query(
        `SELECT amount_minor FROM show_seat_prices WHERE show_id=$1 AND (seat_id=$2 OR (seat_id IS NULL AND category_id=$3)) ORDER BY seat_id NULLS LAST LIMIT 1`,
        [show.id, s.id, s.category_id]);
      const amt = priceRes.rows.length ? priceRes.rows[0].amount_minor : (data.defaultPriceMinor || 15000);
      await client.query(
        'INSERT INTO show_seats (show_id, seat_id, status, price_minor, currency) VALUES ($1,$2,$3,$4,$5)',
        [show.id, s.id, 'available', amt, 'INR']);
    }
    return show;
  });
}

export async function deleteShow(id) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM shows WHERE id=$1 FOR UPDATE', [id]);
    if (!rows.length) throw notFound('show not found');
    await client.query("UPDATE shows SET status='cancelled', updated_at=now() WHERE id=$1", [id]);
    await client.query("UPDATE show_seats SET status='available', hold_id=NULL, booking_id=NULL, updated_at=now() WHERE show_id=$1", [id]);
    await client.query("UPDATE bookings SET status='cancelled', updated_at=now() WHERE show_id=$1 AND status IN ('pending','confirmed')", [id]);
    await client.query("UPDATE tickets SET status='cancelled' WHERE booking_id IN (SELECT id FROM bookings WHERE show_id=$1)", [id]);
    await client.query('INSERT INTO audit_logs (actor_id, action, entity_type, entity_id) VALUES (NULL,$1,$2,$3)',
      ['show_cancelled', 'show', id]);
    return { deleted: true };
  });
}

export async function updateShow(id, data) {
  const { rows } = await pool.query('SELECT * FROM shows WHERE id=$1', [id]);
  if (!rows.length) throw notFound('show not found');
  const m = rows[0];
  const { rows: updated } = await pool.query(
    `UPDATE shows SET starts_at=$1, ends_at=$2, booking_opens_at=$3, booking_closes_at=$4, status=$5, updated_at=now()
     WHERE id=$6 RETURNING *`,
    [data.startsAt ?? m.starts_at, data.endsAt ?? m.ends_at, data.bookingOpensAt ?? m.booking_opens_at,
     data.bookingClosesAt ?? m.booking_closes_at, data.status ?? m.status, id]);
  return updated[0];
}

export async function getShowSeats(showId) {
  const show = await getShow(showId);
  const { rows } = await pool.query(
    `SELECT ss.id AS show_seat_id, ss.status, ss.price_minor, ss.currency, ss.hold_id, ss.booking_id,
            s.id AS seat_id, s.seat_key, s.row_label, s.seat_number, s.x, s.y, s.accessible, s.seat_type, s.col_span, s.fill_color,
            sc.name AS category_name
     FROM show_seats ss
     JOIN seats s ON s.id = ss.seat_id
     LEFT JOIN seat_categories sc ON sc.id = s.category_id
     WHERE ss.show_id = $1
     ORDER BY s.y, s.x`, [showId]);
  // mark expired holds as available in response? We'll treat expired holds as available via status? DB status remains held. We handle in hold creation. For read, mark expired holds as available.
  const now = new Date();
  for (const r of rows) {
    if (r.status === 'held') {
      const h = await pool.query('SELECT expires_at, status FROM seat_holds WHERE id=$1', [r.hold_id]);
      if (!h.rows.length || h.rows[0].status !== 'active' || new Date(h.rows[0].expires_at) <= now) {
        r.status = 'available';
      }
    }
  }
  return { show, seats: rows };
}
