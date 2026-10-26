import { pool, withTransaction } from '../../db/pool.js';
import { notFound, badRequest, conflict } from '../../utils/errors.js';

export async function listShows({ movieId, from, to } = {}) {
  const params = [];
  let where = 'WHERE 1=1';
  if (movieId) { params.push(movieId); where += ` AND s.movie_id=$${params.length}`; }
  if (from) { params.push(from); where += ` AND s.starts_at >= $${params.length}`; }
  if (to) { params.push(to); where += ` AND s.starts_at <= $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT s.*,
            t.name AS theatre_name,
            a.name AS auditorium_name,
            m.title AS movie_title,
            m.language AS movie_language,
            m.certification AS movie_certification,
            m.genre AS movie_genre,
            (
              SELECT mm.url
                FROM movie_media mm
               WHERE mm.movie_id = m.id AND mm.media_type = 'poster'
               ORDER BY mm.display_order, mm.created_at DESC
               LIMIT 1
            ) AS movie_thumbnail_url,
            COALESCE(sc.seat_count, 0)::int AS seat_count,
            COALESCE(sc.booked_count, 0)::int AS booked_count,
            COALESCE(sc.held_count, 0)::int AS held_count,
            sc.price_min_minor,
            sc.price_max_minor
       FROM shows s
       JOIN auditoriums a ON a.id = s.auditorium_id
       JOIN theatres t ON t.id = a.theatre_id
       JOIN movies m ON m.id = s.movie_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS seat_count,
                COUNT(*) FILTER (WHERE ss.status = 'booked')::int AS booked_count,
                COUNT(*) FILTER (WHERE ss.status = 'held')::int AS held_count,
                MIN(ss.price_minor) AS price_min_minor,
                MAX(ss.price_minor) AS price_max_minor
           FROM show_seats ss
          WHERE ss.show_id = s.id
       ) sc ON TRUE
       ${where}
       ORDER BY s.starts_at`,
    params,
  );
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
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [data.movieId, data.auditoriumId, data.startsAt, data.endsAt, data.bookingOpensAt, data.bookingClosesAt, data.status || 'scheduled']);
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
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM shows WHERE id=$1 FOR UPDATE',
      [id],
    );
    if (!rows.length) throw notFound('show not found');
    const current = rows[0];

    const movieId = data.movieId ?? current.movie_id;
    const auditoriumId = data.auditoriumId ?? current.auditorium_id;
    const startsAt = data.startsAt ?? current.starts_at;
    const endsAt = data.endsAt ?? current.ends_at;
    const bookingOpensAt = data.bookingOpensAt ?? current.booking_opens_at;
    const bookingClosesAt = data.bookingClosesAt ?? current.booking_closes_at;
    const status = data.status ?? current.status;

    if (String(movieId) !== String(current.movie_id)) {
      const movie = await client.query('SELECT id FROM movies WHERE id=$1', [movieId]);
      if (!movie.rows.length) throw badRequest('movie not found');
    }

    const venueChanged = String(auditoriumId) !== String(current.auditorium_id);
    let targetAuditorium = null;
    if (venueChanged) {
      const auditorium = await client.query(
        'SELECT id, active_layout_version_id FROM auditoriums WHERE id=$1',
        [auditoriumId],
      );
      if (!auditorium.rows.length) throw badRequest('auditorium not found');
      targetAuditorium = auditorium.rows[0];
      if (!targetAuditorium.active_layout_version_id) {
        throw badRequest('auditorium has no active layout');
      }

      const activeBookings = await client.query(
        `SELECT 1 FROM bookings WHERE show_id=$1 AND status IN ('pending','confirmed') LIMIT 1`,
        [id],
      );
      if (activeBookings.rows.length) {
        throw conflict('cannot change the screen while this show has active bookings');
      }
    }

    if (String(status).toLowerCase() !== 'cancelled') {
      const clash = await client.query(
        `SELECT id FROM shows WHERE auditorium_id=$1 AND id<>$2 AND status<>'cancelled'
         AND starts_at < $3 AND ends_at > $4 LIMIT 1`,
        [auditoriumId, id, endsAt, startsAt],
      );
      if (clash.rows.length) {
        throw conflict('screen already has a show at this time');
      }
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE shows SET movie_id=$1, auditorium_id=$2, starts_at=$3, ends_at=$4,
         booking_opens_at=$5, booking_closes_at=$6, status=$7, updated_at=now()
       WHERE id=$8 RETURNING *`,
      [movieId, auditoriumId, startsAt, endsAt, bookingOpensAt, bookingClosesAt, status, id],
    );
    const updated = updatedRows[0];

    const prices = Array.isArray(data.prices) ? data.prices : [];
    for (const price of prices) {
      if (!price || !Number.isInteger(price.amountMinor) || price.amountMinor <= 0) {
        throw badRequest('seat prices must be positive amounts in minor units');
      }
      const currency = price.currency || 'INR';
      if (price.categoryId) {
        await client.query(
          'DELETE FROM show_seat_prices WHERE show_id=$1 AND category_id=$2 AND seat_id IS NULL',
          [id, price.categoryId],
        );
        await client.query(
          `INSERT INTO show_seat_prices (show_id, category_id, seat_id, amount_minor, currency)
           VALUES ($1,$2,NULL,$3,$4)`,
          [id, price.categoryId, price.amountMinor, currency],
        );
      } else if (price.seatId) {
        await client.query(
          'DELETE FROM show_seat_prices WHERE show_id=$1 AND seat_id=$2',
          [id, price.seatId],
        );
        await client.query(
          `INSERT INTO show_seat_prices (show_id, category_id, seat_id, amount_minor, currency)
           VALUES ($1,NULL,$2,$3,$4)`,
          [id, price.seatId, price.amountMinor, currency],
        );
      }
    }

    if (venueChanged) {
      // Existing seat holds were created for the old auditorium layout.
      await client.query(
        `UPDATE seat_holds SET status='released', released_at=now()
         WHERE show_id=$1 AND status='active'`,
        [id],
      );
      await client.query(
        `UPDATE show_seats SET status='available', hold_id=NULL, updated_at=now()
         WHERE show_id=$1 AND status='held'`,
        [id],
      );

      const priceRows = await client.query(
        'SELECT category_id, seat_id, amount_minor, currency FROM show_seat_prices WHERE show_id=$1',
        [id],
      );
      const categoryPrices = new Map();
      const seatPrices = new Map();
      let fallback = null;
      for (const row of priceRows.rows) {
        if (row.category_id) categoryPrices.set(row.category_id, row);
        if (row.seat_id) seatPrices.set(row.seat_id, row);
        if (fallback == null) fallback = row;
      }
      if (fallback == null) {
        const previousSeat = await client.query(
          `SELECT price_minor, currency FROM show_seats
           WHERE show_id=$1 AND price_minor IS NOT NULL
           ORDER BY updated_at DESC LIMIT 1`,
          [id],
        );
        if (previousSeat.rows.length) {
          fallback = {
            amount_minor: previousSeat.rows[0].price_minor,
            currency: previousSeat.rows[0].currency,
          };
        }
      }
      const defaultAmount = data.defaultPriceMinor ?? fallback?.amount_minor ?? 15000;
      const defaultCurrency = fallback?.currency || 'INR';

      const seats = await client.query(
        `SELECT id, category_id FROM seats
         WHERE auditorium_id=$1 AND layout_version_id=$2`,
        [auditoriumId, targetAuditorium.active_layout_version_id],
      );
      if (!seats.rows.length) {
        throw badRequest('auditorium has no seats in its active layout');
      }
      const seatIds = [];
      const seatAmounts = [];
      const seatCurrencies = [];
      for (const seat of seats.rows) {
        const exact = seatPrices.get(seat.id);
        const byCategory = seat.category_id ? categoryPrices.get(seat.category_id) : null;
        seatIds.push(seat.id);
        seatAmounts.push(exact?.amount_minor ?? byCategory?.amount_minor ?? defaultAmount);
        seatCurrencies.push(exact?.currency || byCategory?.currency || defaultCurrency);
      }
      await client.query(
        `INSERT INTO show_seats (show_id, seat_id, status, price_minor, currency)
         SELECT $1::uuid, x.seat_id, 'available', x.amount_minor, x.currency
         FROM unnest($2::uuid[], $3::int[], $4::text[]) AS x(seat_id, amount_minor, currency)
         ON CONFLICT (show_id, seat_id) DO UPDATE SET
           status='available', hold_id=NULL, booking_id=NULL,
           price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, updated_at=now()`,
        [id, seatIds, seatAmounts, seatCurrencies],
      );
    }

    for (const price of prices) {
      const currency = price.currency || 'INR';
      if (price.categoryId) {
        await client.query(
          `UPDATE show_seats ss SET price_minor=$1, currency=$2, updated_at=now()
           FROM seats s
           WHERE ss.show_id=$3 AND ss.seat_id=s.id
             AND s.auditorium_id=$4 AND s.category_id=$5`,
          [price.amountMinor, currency, id, auditoriumId, price.categoryId],
        );
      } else if (price.seatId) {
        await client.query(
          `UPDATE show_seats SET price_minor=$1, currency=$2, updated_at=now()
           WHERE show_id=$3 AND seat_id=$4`,
          [price.amountMinor, currency, id, price.seatId],
        );
      }
    }

    return updated;
  });
}

export async function getShowSeats(showId) {
  const show = await getShow(showId);
  const { rows } = await pool.query(
    `SELECT ss.id AS show_seat_id, ss.status, ss.price_minor, ss.currency, ss.hold_id, ss.booking_id,
            s.id AS seat_id, s.category_id, s.seat_key, s.row_label, s.seat_number, s.x, s.y, s.accessible, s.seat_type, s.col_span, s.fill_color,
            sc.name AS category_name
     FROM show_seats ss
     JOIN shows sh ON sh.id = ss.show_id
     JOIN seats s ON s.id = ss.seat_id
     LEFT JOIN seat_categories sc ON sc.id = s.category_id
     WHERE ss.show_id = $1 AND s.auditorium_id = sh.auditorium_id
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
