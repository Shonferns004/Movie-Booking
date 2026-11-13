import fs from 'node:fs';
import pg from 'pg';

const BASE = 'https://movie-worker.konkani-samudai.workers.dev';
const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
);

const ADMIN_TOKEN = env.ADMIN_TOKEN;
const CRON = env.INTERNAL_CRON_SECRET;
const stamp = Date.now();
const email = `e2e-${stamp}@example.test`;
const password = 'TestPass123!';

const results = [];
function record(name, expected, status, body) {
  const ok = Array.isArray(expected) ? expected.includes(status) : status === expected;
  results.push({ name, expected: String(expected), status, ok, note: typeof body === 'string' ? body.slice(0, 90) : JSON.stringify(body).slice(0, 90) });
  return ok;
}

async function call(method, path, { token, adminToken, body, form, cron } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (adminToken) headers['x-admin-token'] = ADMIN_TOKEN;
  if (cron) headers.Authorization = `Bearer ${CRON}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, body: parsed };
}

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const created = { users: [], movies: [], shows: [], theatres: [], categories: [] };

// ---------- public ----------
record('GET /health', 200, (await call('GET', '/health')).status, '');
record('GET /api/v1/movies', 200, (await call('GET', '/api/v1/movies')).status, '');
record('GET /api/v1/movies/does-not-exist', [404], (await call('GET', '/api/v1/movies/does-not-exist')).status, '');
record('GET /api/v1/theatres', 200, (await call('GET', '/api/v1/theatres')).status, '');
record('GET /api/v1/theatres/categories', 200, (await call('GET', '/api/v1/theatres/categories')).status, '');
record('GET /api/v1/shows', 200, (await call('GET', '/api/v1/shows')).status, '');
record('GET /api/v1/shows/<random>/seats', 404, (await call('GET', `/api/v1/shows/${crypto.randomUUID()}/seats`)).status, '');

// ---------- auth ----------
const reg = await call('POST', '/api/v1/auth/register', { body: { email, password, displayName: 'E2E Test' } });
record('POST /auth/register', 201, reg.status, reg.body);
if (reg.body?.user?.id) created.users.push(reg.body.user.id);

await db.query(
  `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name='ADMIN' ON CONFLICT DO NOTHING`,
  [created.users[0]],
);

const login = await call('POST', '/api/v1/auth/login', { body: { email, password } });
record('POST /auth/login', 200, login.status, { ...login.body, token: login.body?.accessToken ? 'set' : undefined });
const token = login.body?.accessToken || login.body?.token;

const refresh = await call('POST', '/api/v1/auth/refresh', { body: { refreshToken: login.body?.refreshToken } });
record('POST /auth/refresh', 200, refresh.status, refresh.body);

// ---------- guards ----------
record('GET /bookings/me/tickets (no token)', 401, (await call('GET', '/api/v1/bookings/me/tickets')).status, '');
record('GET /bookings (no token)', 401, (await call('GET', '/api/v1/bookings')).status, '');
record('POST /movies (no token)', 401, (await call('POST', '/api/v1/movies', { body: {} })).status, '');
record('GET /tickets/:id (no token)', 401, (await call('GET', `/api/v1/tickets/${crypto.randomUUID()}`)).status, '');
record('POST /staff/tickets/validate (no token)', 401, (await call('POST', '/api/v1/staff/tickets/validate', { body: {} })).status, '');
record('GET /admin/theatres (no token)', 401, (await call('GET', '/api/v1/admin/theatres')).status, '');

// ---------- internal ----------
record('GET /internal/keepalive (secret)', 200, (await call('GET', '/api/v1/internal/keepalive', { cron: true })).status, '');
record('GET /internal/keepalive (none)', 401, (await call('GET', '/api/v1/internal/keepalive')).status, '');
const tick = await call('GET', '/api/v1/internal/tick', { cron: true });
record('GET /internal/tick (secret)', 200, tick.status, tick.body);

// ---------- admin CRUD ----------
record('GET /admin/theatres (token)', 200, (await call('GET', '/api/v1/admin/theatres', { adminToken: true })).status, '');
const theatre = await call('POST', '/api/v1/admin/theatres', { adminToken: true, body: { name: `E2E Theatre ${stamp}`, address: 'Test', timezone: 'Asia/Kolkata' } });
record('POST /admin/theatres', 201, theatre.status, theatre.body);
const theatreId = theatre.body?.theatre?.id;
if (theatreId) created.theatres.push(theatreId);

const aud = await call('POST', `/api/v1/admin/theatres/${theatreId}/auditoriums`, { adminToken: true, body: { name: `E2E Audi ${stamp}` } });
record('POST /admin/theatres/:id/auditoriums', 201, aud.status, aud.body);
const auditoriumId = aud.body?.auditorium?.id;

const layout = {
  rows: 2,
  cols: 2,
  grid: [
    [{ type: 'standard', row_label: 'A', seat_number: 1 }, { type: 'standard', row_label: 'A', seat_number: 2 }],
    [{ type: 'premium', row_label: 'B', seat_number: 1 }, { type: 'empty' }],
  ],
};
record('POST /admin/auditoriums/:id/layout', 201, (await call('POST', `/api/v1/admin/auditoriums/${auditoriumId}/layout`, { adminToken: true, body: layout })).status, '');
record('GET /admin/auditoriums/:id/layout', 200, (await call('GET', `/api/v1/admin/auditoriums/${auditoriumId}/layout`, { adminToken: true })).status, '');
record('GET /admin/seat-categories', 200, (await call('GET', '/api/v1/admin/seat-categories', { adminToken: true })).status, '');

const cat = await call('POST', '/api/v1/admin/seat-categories', { adminToken: true, body: { name: `E2E ${stamp}`, description: 'temp' } });
record('POST /admin/seat-categories', 201, cat.status, cat.body);
if (cat.body?.category?.id) created.categories.push(cat.body.category.id);

const movie = await call('POST', '/api/v1/movies', { token, body: { slug: `e2e-${stamp}`, title: `E2E Movie ${stamp}`, durationMinutes: 120, language: 'EN', status: 'published' } });
record('POST /movies (admin jwt)', 201, movie.status, movie.body);
const movieId = movie.body?.id || movie.body?.movie?.id;
if (movieId) created.movies.push(movieId);

record('PATCH /movies/:id', 200, (await call('PATCH', `/api/v1/movies/${movieId}`, { token, body: { synopsis: 'updated by e2e' } })).status, '');
record('GET /movies/:id', 200, (await call('GET', `/api/v1/movies/${movieId}`)).status, '');

// ---------- upload to Neon bucket ----------
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/wF9nH0AAAAASUVORK5CYII=', 'base64');
const form = new FormData();
form.append('type', 'poster');
form.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
const up = await call('POST', `/api/v1/movies/${movieId}/media`, { token, form });
record('POST /movies/:id/media (Neon bucket)', 201, up.status, up.body);

// ---------- show + booking flow ----------
const now = Date.now();
const show = await call('POST', '/api/v1/shows', {
  token,
  body: {
    movieId,
    auditoriumId,
    startsAt: new Date(now + 3600e3).toISOString(),
    endsAt: new Date(now + 3600e3 + 7200e3).toISOString(),
    bookingOpensAt: new Date(now - 3600e3).toISOString(),
    bookingClosesAt: new Date(now + 3500e3).toISOString(),
    defaultPriceMinor: 20000,
  },
});
record('POST /shows', 201, show.status, show.body);
const showId = show.body?.id || show.body?.show?.id;
if (showId) created.shows.push(showId);

record('GET /shows/:id', 200, (await call('GET', `/api/v1/shows/${showId}`)).status, '');
record('PATCH /shows/:id', 200, (await call('PATCH', `/api/v1/shows/${showId}`, { token, body: { defaultPriceMinor: 25000 } })).status, '');

const seats = await call('GET', `/api/v1/shows/${showId}/seats`);
record('GET /shows/:id/seats', 200, seats.status, Array.isArray(seats.body) ? `${seats.body.length} seats` : seats.body);
const seatRows = Array.isArray(seats.body) ? seats.body : (seats.body?.seats || []);
const seatIds = seatRows.slice(0, 2).map((s) => s.id || s.seat_id);

const theatreAuds = await call('GET', `/api/v1/theatres/${theatreId}/auditoriums`);
record('GET /theatres/:id/auditoriums', 200, theatreAuds.status, '');
record('GET /theatres/auditoriums/:id/layout', 200, (await call('GET', `/api/v1/theatres/auditoriums/${auditoriumId}/layout`)).status, '');

const hold = await call('POST', '/api/v1/seat-holds', { token, body: { showId, seatIds } });
record('POST /seat-holds', 201, hold.status, hold.body);
const holdId = hold.body?.holdId || hold.body?.hold?.id;

const booking = await call('POST', '/api/v1/bookings', { token, body: { holdId, contactEmail: email } });
record('POST /bookings', 201, booking.status, booking.body);
const reference = booking.body?.booking_reference || booking.body?.reference;
const bookingId = booking.body?.id || booking.body?.booking?.id;

record('GET /bookings/:reference', 200, (await call('GET', `/api/v1/bookings/${reference}`, { token })).status, '');
record('GET /bookings/me/tickets', 200, (await call('GET', '/api/v1/bookings/me/tickets', { token })).status, '');
record('GET /bookings (admin)', 200, (await call('GET', '/api/v1/bookings', { token })).status, '');

let ticketId = null;
try {
  const t = await db.query('SELECT id FROM tickets WHERE booking_id=$1 LIMIT 1', [bookingId]);
  ticketId = t.rows[0]?.id;
} catch { /* table may be empty */ }
if (ticketId) {
  record('GET /tickets/:id', 200, (await call('GET', `/api/v1/tickets/${ticketId}`, { token })).status, '');
  record('POST /tickets/:id/resend-email', [200, 202], (await call('POST', `/api/v1/tickets/${ticketId}/resend-email`, { token })).status, '');
  record('POST /staff/tickets/validate', [200, 400, 404, 409], (await call('POST', '/api/v1/staff/tickets/validate', { token, body: { code: 'bogus' } })).status, '');
  record('GET /staff/scan-history', 200, (await call('GET', '/api/v1/staff/scan-history', { token })).status, '');
}

// ---------- payments ----------
const pay = await call('POST', '/api/v1/payments/youpi/orders', { token, body: { bookingReference: reference } });
record('POST /payments/youpi/orders', 201, pay.status, pay.body);
record('POST /payments/orders', [201, 400, 404], (await call('POST', '/api/v1/payments/orders', { token, body: { bookingReference: reference } })).status, '');
record('GET /payments/youpi/status/:id', [200, 404, 502, 503], (await call('GET', '/api/v1/payments/youpi/status/e2e-none')).status, '');
record('POST /payments/mock/complete', [200, 400, 404], (await call('POST', '/api/v1/payments/mock/complete', { body: { bookingReference: reference } })).status, '');
record('POST /payments/webhooks/youpi', [400, 401], (await call('POST', '/api/v1/payments/webhooks/youpi', { body: { paymentId: 'x' } })).status, '');
record('DELETE /seat-holds/:id', [200, 404, 409], (await call('DELETE', `/api/v1/seat-holds/${holdId}`, { token })).status, '');

// ---------- report ----------
const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + pad('ENDPOINT', 46) + pad('EXPECT', 12) + pad('GOT', 6) + 'RESULT');
console.log('-'.repeat(110));
for (const r of results) {
  console.log(pad(r.name, 46) + pad(r.expected, 12) + pad(r.status, 6) + (r.ok ? 'PASS' : `FAIL  ${r.note}`));
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed, ${failed.length} failed`);

// ---------- cleanup ----------
const cleanup = [
  ['UPDATE show_seats SET booking_id=NULL, hold_id=NULL WHERE booking_id=$1', [bookingId]],
  ['UPDATE show_seats SET hold_id=NULL WHERE hold_id=$1', [holdId]],
  ['UPDATE bookings SET hold_id=NULL WHERE hold_id=$1', [holdId]],
  ['DELETE FROM ticket_scans WHERE ticket_id IN (SELECT id FROM tickets WHERE booking_id=$1)', [bookingId]],
  ['DELETE FROM tickets WHERE booking_id=$1', [bookingId]],
  ['DELETE FROM payments WHERE booking_id=$1', [bookingId]],
  ['DELETE FROM booking_seats WHERE booking_id=$1', [bookingId]],
  ['DELETE FROM bookings WHERE id=$1', [bookingId]],
  ['DELETE FROM seat_hold_items WHERE hold_id=$1', [holdId]],
  ['DELETE FROM seat_holds WHERE id=$1', [holdId]],
  ['DELETE FROM show_seat_prices WHERE show_id=$1', [showId]],
  ['DELETE FROM show_seats WHERE show_id=$1', [showId]],
  ['DELETE FROM shows WHERE id=$1', [showId]],
  ['DELETE FROM movie_media WHERE movie_id=$1', [movieId]],
  ['DELETE FROM movies WHERE id=$1', [movieId]],
  ['UPDATE auditoriums SET active_layout_version_id=NULL WHERE id=$1', [auditoriumId]],
  ['DELETE FROM seats WHERE layout_version_id IN (SELECT id FROM seat_layout_versions WHERE auditorium_id=$1)', [auditoriumId]],
  ['DELETE FROM seat_layout_versions WHERE auditorium_id=$1', [auditoriumId]],
  ['DELETE FROM auditoriums WHERE id=$1', [auditoriumId]],
  ['DELETE FROM theatres WHERE id=$1', [theatreId]],
  ['DELETE FROM seat_categories WHERE id = ANY($1::uuid[])', [created.categories]],
  ['DELETE FROM user_roles WHERE user_id = ANY($1::uuid[])', [created.users]],
  ['DELETE FROM sessions WHERE user_id = ANY($1::uuid[])', [created.users]],
  ['DELETE FROM users WHERE id = ANY($1::uuid[])', [created.users]],
];
let cleaned = 0;
for (const [sql, params] of cleanup) {
  if (!params[0]) continue;
  try { const r = await db.query(sql, params); cleaned += r.rowCount || 0; } catch (e) { console.log('cleanup skip:', e.message.slice(0, 60)); }
}
console.log(`cleanup: ${cleaned} rows removed`);
await db.end();
process.exit(failed.length ? 1 : 0);
