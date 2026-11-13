/**
 * Demo data for the storefront UI.
 *
 * Creates a cinema (two theatres, one screen each), a full seat layout with the
 * usual price tiers, three published movies and shows for the next few days with
 * a realistic mix of free / fast-filling / sold-out screens.
 *
 * Usage:
 *   npm run seed:demo
 *
 * Safe to run more than once: every row is matched by a natural key before it is
 * inserted, and nothing is deleted.
 */
import { pool } from './pool.js';

const CATEGORIES = [
  ['Normal', 'Front rows, entry price'],
  ['Executive', 'Standard seating'],
  ['Executive XL', 'Extra leg-room'],
  ['Premium', 'Centre block, best view'],
  ['Recliner', 'Recliner loungers at the back'],
  ['Handicapped', 'Wheelchair accessible seats'],
];

// Price per tier, in paise (₹600 = 60000).
const PRICES = {
  Normal: 60000,
  Executive: 62000,
  'Executive XL': 66000,
  Premium: 64000,
  Recliner: 128000,
  Handicapped: 60000,
};

/**
 * Rows run from the back of the hall (N, recliners) to the screen (A).
 * `blocks` are [first column, seat count] pairs, so the gaps become aisles.
 */
const ROW_PLAN = [
  { row: 'N', y: 1, category: 'Recliner', blocks: [[1, 14]], span: 2 },
  { row: 'M', y: 2, category: 'Premium', blocks: [[1, 6], [8, 14], [23, 3]] },
  { row: 'L', y: 3, category: 'Premium', blocks: [[1, 6], [8, 14], [23, 3]] },
  { row: 'K', y: 4, category: 'Premium', blocks: [[1, 6], [8, 14], [23, 3]] },
  { row: 'J', y: 5, category: 'Premium', blocks: [[1, 6], [8, 14], [23, 3]] },
  { row: 'I', y: 6, category: 'Premium', blocks: [[1, 6], [8, 14], [23, 3]] },
  { row: 'H', y: 7, category: 'Premium', blocks: [[1, 6], [8, 14], [23, 3]] },
  { row: 'G', y: 8, category: 'Premium', blocks: [[1, 6], [8, 14], [23, 3]] },
  { row: 'F', y: 9, category: 'Premium', blocks: [[1, 6], [8, 14], [23, 3]] },
  { row: 'E', y: 10, category: 'Executive XL', blocks: [[1, 6], [8, 8], [17, 2]] },
  { row: 'D', y: 11, category: 'Executive', blocks: [[1, 6], [8, 8], [17, 2]] },
  { row: 'C', y: 12, category: 'Normal', blocks: [[1, 10], [12, 10]] },
  { row: 'B', y: 13, category: 'Normal', blocks: [[1, 10], [12, 10]] },
  { row: 'A', y: 14, category: 'Normal', blocks: [[1, 10], [12, 10]] },
];

const VENUES = [
  {
    theatre: { name: 'Konkani Samudai Cinemas, Panaji', address: 'Campal, Panaji, Goa' },
    auditorium: 'Screen 1 · Dolby Atmos',
    slots: [[9, 30], [13, 15], [17, 0], [20, 45]],
  },
  {
    theatre: { name: 'Samudai Cineplex, Margao', address: 'Old Market Road, Margao, Goa' },
    auditorium: 'Screen 1 · 2K Laser',
    slots: [[10, 15], [14, 0], [17, 45], [21, 30]],
  },
];

const MOVIES = [
  {
    slug: 'ramayana-hindi',
    title: 'Ramayana (Hindi)',
    synopsis: 'A sweeping retelling of the epic journey, from the forests of Panchavati to the shores of Lanka.',
    durationMinutes: 195,
    language: 'Hindi',
    genre: 'Action, Adventure, Drama, Mythological',
    certification: 'UA',
    posterLines: ['RAMAYANA', '(HINDI)'],
    posterColors: ['#C2305E', '#3A0F22'],
  },
  {
    slug: 'konkani-nights',
    title: 'Konkani Nights',
    synopsis: 'Two cousins, one old fishing boat and a monsoon night that changes their family forever.',
    durationMinutes: 128,
    language: 'Konkani',
    genre: 'Drama, Family',
    certification: 'U',
    posterLines: ['KONKANI', 'NIGHTS'],
    posterColors: ['#1D5C66', '#071E23'],
  },
  {
    slug: 'monsoon-run',
    title: 'Monsoon Run',
    synopsis: 'A courier with one last delivery races the flood waters across the Western Ghats.',
    durationMinutes: 142,
    language: 'Hindi',
    genre: 'Thriller, Action',
    certification: 'UA',
    posterLines: ['MONSOON', 'RUN'],
    posterColors: ['#B8791A', '#2B1503'],
  },
];

/**
 * Posters are inline SVGs so the demo never depends on an external image host.
 */
function demoPoster([line1, line2], [from, to]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="900" fill="url(#bg)"/>
  <circle cx="520" cy="130" r="210" fill="#EFEBE0" opacity="0.08"/>
  <circle cx="70" cy="820" r="240" fill="#EFEBE0" opacity="0.06"/>
  <g fill="#EFEBE0" opacity="0.18">
    <rect x="60" y="72" width="18" height="26" rx="3"/><rect x="94" y="72" width="18" height="26" rx="3"/>
    <rect x="128" y="72" width="18" height="26" rx="3"/><rect x="162" y="72" width="18" height="26" rx="3"/>
  </g>
  <text x="60" y="620" font-family="Georgia, 'Times New Roman', serif" font-size="86" font-weight="bold" fill="#EFEBE0">${line1}</text>
  <text x="60" y="712" font-family="Georgia, 'Times New Roman', serif" font-size="58" font-weight="bold" fill="#F4B63F">${line2}</text>
  <rect x="60" y="752" width="86" height="3" fill="#EFEBE0" opacity="0.6"/>
  <text x="60" y="800" font-family="Helvetica, Arial, sans-serif" font-size="18" letter-spacing="5" fill="#EFEBE0" opacity="0.75">KONKANI SAMUDAI</text>
  <text x="60" y="828" font-family="Helvetica, Arial, sans-serif" font-size="13" letter-spacing="3" fill="#EFEBE0" opacity="0.45">CINEMA &amp; SCREENHOUSE</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// How full a screen is, cycling through the shows: free, filling, fast, sold out.
const FILL_RATES = [0.08, 0.38, 0.62, 0.9, 0.25, 0.72, 1, 0.5, 0.15, 0.86, 0.45, 0.67];

function buildSeatPlan() {
  const seats = [];
  for (const plan of ROW_PLAN) {
    let number = 1;
    for (const [firstColumn, count] of plan.blocks) {
      for (let i = 0; i < count; i += 1) {
        const accessible = plan.row === 'A' && (number === 1 || number === 20);
        seats.push({
          row: plan.row,
          number: String(number),
          x: firstColumn + i * (plan.span || 1),
          y: plan.y,
          span: plan.span || 1,
          category: plan.category,
          accessible,
        });
        number += 1;
      }
    }
  }
  return seats;
}

async function ensureCategories(client) {
  for (const [name, description] of CATEGORIES) {
    await client.query(
      'INSERT INTO seat_categories (name, description) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING',
      [name, description],
    );
  }
  const { rows } = await client.query('SELECT id, name FROM seat_categories');
  return new Map(rows.map((row) => [row.name, row.id]));
}

async function ensureTheatre(client, { name, address }) {
  const existing = await client.query('SELECT id FROM theatres WHERE name=$1 LIMIT 1', [name]);
  if (existing.rows.length) return existing.rows[0].id;
  const inserted = await client.query(
    "INSERT INTO theatres (name, address, timezone, status) VALUES ($1,$2,'Asia/Kolkata','active') RETURNING id",
    [name, address],
  );
  return inserted.rows[0].id;
}

async function ensureAuditorium(client, theatreId, name) {
  const existing = await client.query(
    'SELECT id, active_layout_version_id FROM auditoriums WHERE theatre_id=$1 AND name=$2 LIMIT 1',
    [theatreId, name],
  );
  if (existing.rows.length) return existing.rows[0];
  const inserted = await client.query(
    'INSERT INTO auditoriums (theatre_id, name, status) VALUES ($1,$2,\'active\') RETURNING id, active_layout_version_id',
    [theatreId, name],
  );
  return inserted.rows[0];
}

async function ensureLayout(client, auditoriumId, categoryIds) {
  const current = await client.query(
    'SELECT active_layout_version_id FROM auditoriums WHERE id=$1 FOR UPDATE',
    [auditoriumId],
  );
  if (current.rows[0].active_layout_version_id) {
    return current.rows[0].active_layout_version_id;
  }

  const version = await client.query(
    `INSERT INTO seat_layout_versions (auditorium_id, version, import_status, approved_at, source_file_name)
     VALUES ($1, 1, 'approved', now(), 'seed-demo') RETURNING id`,
    [auditoriumId],
  );
  const versionId = version.rows[0].id;
  const seats = buildSeatPlan();

  await client.query(
    `INSERT INTO seats (auditorium_id, layout_version_id, seat_key, row_label, seat_number, x, y, category_id, seat_type, accessible, col_span)
     SELECT $1, $2, u.seat_key, u.row_label, u.seat_number, u.x, u.y, u.category_id, 'seat', u.accessible, u.col_span
     FROM unnest($3::text[], $4::text[], $5::text[], $6::int[], $7::int[], $8::uuid[], $9::boolean[], $10::int[])
       AS u(seat_key, row_label, seat_number, x, y, category_id, accessible, col_span)`,
    [
      auditoriumId,
      versionId,
      seats.map((seat) => `${seat.row}${seat.number}`),
      seats.map((seat) => seat.row),
      seats.map((seat) => seat.number),
      seats.map((seat) => seat.x),
      seats.map((seat) => seat.y),
      seats.map((seat) => categoryIds.get(seat.category)),
      seats.map((seat) => seat.accessible),
      seats.map((seat) => seat.span),
    ],
  );

  await client.query('UPDATE auditoriums SET active_layout_version_id=$1, updated_at=now() WHERE id=$2', [versionId, auditoriumId]);
  return versionId;
}

async function ensureMovie(client, movie) {
  const { rows } = await client.query(
    `INSERT INTO movies (slug, title, synopsis, duration_minutes, language, genre, certification, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'published')
     ON CONFLICT (slug) DO UPDATE SET
       title=EXCLUDED.title, synopsis=EXCLUDED.synopsis, duration_minutes=EXCLUDED.duration_minutes,
       language=EXCLUDED.language, genre=EXCLUDED.genre, certification=EXCLUDED.certification,
       status='published', updated_at=now()
     RETURNING id`,
    [movie.slug, movie.title, movie.synopsis, movie.durationMinutes, movie.language, movie.genre, movie.certification],
  );
  const movieId = rows[0].id;

  const posterUrl = demoPoster(movie.posterLines, movie.posterColors);
  const poster = await client.query(
    "SELECT id FROM movie_media WHERE movie_id=$1 AND media_type='poster' LIMIT 1",
    [movieId],
  );
  if (poster.rows.length) {
    await client.query('UPDATE movie_media SET url=$2 WHERE id=$1', [poster.rows[0].id, posterUrl]);
  } else {
    await client.query(
      "INSERT INTO movie_media (movie_id, media_type, url, alt_text, display_order) VALUES ($1,'poster',$2,$3,0)",
      [movieId, posterUrl, `${movie.title} poster`],
    );
  }
  return movieId;
}

async function seedShow(client, { movie, auditorium, versionId, startsAt, fillRate, categoryIds }) {
  const durationMinutes = movie.durationMinutes + 20;
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000);
  const opensAt = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
  const closesAt = new Date(startsAt.getTime() - 15 * 60 * 1000);

  const { rows } = await client.query(
    `INSERT INTO shows (movie_id, auditorium_id, starts_at, ends_at, booking_opens_at, booking_closes_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,'scheduled') RETURNING id`,
    [movie.id, auditorium.id, startsAt.toISOString(), endsAt.toISOString(), opensAt.toISOString(), closesAt.toISOString()],
  );
  const showId = rows[0].id;

  const usedCategories = await client.query(
    'SELECT DISTINCT category_id FROM seats WHERE layout_version_id=$1',
    [versionId],
  );
  const pricedCategories = usedCategories.rows
    .map((row) => row.category_id)
    .filter(Boolean);
  for (const categoryId of pricedCategories) {
    const name = [...categoryIds.entries()].find(([, id]) => id === categoryId)?.[0];
    await client.query(
      'INSERT INTO show_seat_prices (show_id, category_id, amount_minor, currency) VALUES ($1,$2,$3,$4)',
      [showId, categoryId, PRICES[name] || PRICES.Normal, 'INR'],
    );
  }

  const { rows: seatRows } = await client.query(
    'SELECT id, category_id FROM seats WHERE layout_version_id=$1 ORDER BY y, x',
    [versionId],
  );
  const priceFor = new Map(
    [...categoryIds.entries()].map(([name, id]) => [id, PRICES[name] || PRICES.Normal]),
  );
  const statuses = seatRows.map((seat, index) => {
    const booked = ((index * 37 + Math.round(fillRate * 100) * 11) % 100) < Math.round(fillRate * 100);
    return booked ? 'booked' : 'available';
  });

  await client.query(
    `INSERT INTO show_seats (show_id, seat_id, status, price_minor, currency)
     SELECT $1, u.seat_id, u.status, u.price, 'INR'
     FROM unnest($2::uuid[], $3::text[], $4::int[]) AS u(seat_id, status, price)`,
    [
      showId,
      seatRows.map((seat) => seat.id),
      statuses,
      seatRows.map((seat) => priceFor.get(seat.category_id) || PRICES.Normal),
    ],
  );

  return showId;
}

async function main() {
  const now = new Date();
  const client = await pool.connect();
  let showCount = 0;

  try {
    await client.query('BEGIN');

    const categoryIds = await ensureCategories(client);

    const auditoriums = [];
    for (const venue of VENUES) {
      const theatreId = await ensureTheatre(client, venue.theatre);
      const auditorium = await ensureAuditorium(client, theatreId, venue.auditorium);
      const versionId = await ensureLayout(client, auditorium.id, categoryIds);
      auditoriums.push({ ...auditorium, versionId, slots: venue.slots });
    }

    const movies = [];
    for (const movie of MOVIES) {
      movies.push({ ...movie, id: await ensureMovie(client, movie) });
    }

    for (let dayOffset = 0; dayOffset < 4; dayOffset += 1) {
      for (const [venueIndex, auditorium] of auditoriums.entries()) {
        for (const [slotIndex, [hour, minute]] of auditorium.slots.entries()) {
          const startsAt = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + dayOffset,
            hour,
            minute,
            0,
            0,
          );
          // Everything in the past (or too close to showtime) is skipped.
          if (startsAt.getTime() < now.getTime() + 20 * 60 * 1000) continue;

          const existing = await client.query(
            'SELECT id FROM shows WHERE auditorium_id=$1 AND starts_at=$2 LIMIT 1',
            [auditorium.id, startsAt.toISOString()],
          );
          if (existing.rows.length) continue;

          const movie = movies[(dayOffset * 11 + slotIndex * 5 + venueIndex * 7) % movies.length];
          const fillRate = FILL_RATES[(dayOffset * 8 + venueIndex * 4 + slotIndex) % FILL_RATES.length];

          await seedShow(client, {
            movie,
            auditorium,
            versionId: auditorium.versionId,
            startsAt,
            fillRate,
            categoryIds,
          });
          showCount += 1;
        }
      }
    }

    await client.query('COMMIT');
    console.log(`demo seed complete — ${VENUES.length} cinemas, ${MOVIES.length} movies, ${showCount} new shows`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
