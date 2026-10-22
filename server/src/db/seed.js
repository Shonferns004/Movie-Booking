import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { importAllLayouts } from './importLayouts.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const name of ['CUSTOMER', 'ADMIN', 'SCANNER', 'SUPERVISOR']) {
      await client.query('INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
    }

    await importAllLayouts(client);

    // theatre/auditorium
    const audRes = await client.query("SELECT id FROM auditoriums WHERE name='AUDI 1'");
    const auditoriumId = audRes.rows[0].id;
    const verRes = await client.query('SELECT active_layout_version_id FROM auditoriums WHERE id=$1', [auditoriumId]);
    const versionId = verRes.rows[0].active_layout_version_id;

    // admin user
    const adminEmail = 'admin@movie.local';
    let adminId;
    const r = await client.query('SELECT id FROM users WHERE email=$1', [adminEmail]);
    if (r.rows.length) adminId = r.rows[0].id;
    else {
      const hash = await bcrypt.hash('admin123', 10);
      const ins = await client.query('INSERT INTO users (email, password_hash, display_name, status) VALUES ($1,$2,$3,$4) RETURNING id', [adminEmail, hash, 'Admin', 'active']);
      adminId = ins.rows[0].id;
    }
    const adminRole = await client.query("SELECT id FROM roles WHERE name='ADMIN'");
    await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [adminId, adminRole.rows[0].id]);

    // app admin user
    const appAdminEmail = 'adminapp@movie.local';
    const aar = await client.query('SELECT id FROM users WHERE email=$1', [appAdminEmail]);
    if (!aar.rows.length) {
      const hash = await bcrypt.hash('adminapp123', 10);
      const ins = await client.query('INSERT INTO users (email, password_hash, display_name, status) VALUES ($1,$2,$3,$4) RETURNING id', [appAdminEmail, hash, 'App Admin', 'active']);
      const uid = ins.rows[0].id;
      const role = await client.query("SELECT id FROM roles WHERE name='ADMIN'");
      await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, role.rows[0].id]);
    }

    // app scanner user
    const appScannerEmail = 'scannerapp@movie.local';
    const asr = await client.query('SELECT id FROM users WHERE email=$1', [appScannerEmail]);
    if (!asr.rows.length) {
      const hash = await bcrypt.hash('scannerapp123', 10);
      const ins = await client.query('INSERT INTO users (email, password_hash, display_name, status) VALUES ($1,$2,$3,$4) RETURNING id', [appScannerEmail, hash, 'App Scanner', 'active']);
      const uid = ins.rows[0].id;
      const role = await client.query("SELECT id FROM roles WHERE name='SCANNER'");
      await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, role.rows[0].id]);
    }

    // scanner user
    const scannerEmail = 'scanner@movie.local';
    const sr = await client.query('SELECT id FROM users WHERE email=$1', [scannerEmail]);
    let scannerId;
    if (sr.rows.length) scannerId = sr.rows[0].id;
    else {
      const hash = await bcrypt.hash('scanner123', 10);
      const ins = await client.query('INSERT INTO users (email, password_hash, display_name, status) VALUES ($1,$2,$3,$4) RETURNING id', [scannerEmail, hash, 'Scanner', 'active']);
      scannerId = ins.rows[0].id;
    }
    const scannerRole = await client.query("SELECT id FROM roles WHERE name='SCANNER'");
    await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [scannerId, scannerRole.rows[0].id]);

    // customer user
    const custEmail = 'customer@movie.local';
    const cr = await client.query('SELECT id FROM users WHERE email=$1', [custEmail]);
    if (!cr.rows.length) {
      const hash = await bcrypt.hash('customer123', 10);
      const ins = await client.query('INSERT INTO users (email, password_hash, display_name, status) VALUES ($1,$2,$3,$4) RETURNING id', [custEmail, hash, 'Customer', 'active']);
      const custId = ins.rows[0].id;
      const custRole = await client.query("SELECT id FROM roles WHERE name='CUSTOMER'");
      await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [custId, custRole.rows[0].id]);
    }

    // movie
    const movieSlug = 'demo-movie';
    const mr = await client.query('SELECT id FROM movies WHERE slug=$1', [movieSlug]);
    let movieId;
    if (mr.rows.length) movieId = mr.rows[0].id;
    else {
      const ins = await client.query(`INSERT INTO movies (slug, title, synopsis, duration_minutes, language, genre, certification, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'published') RETURNING id`,
        [movieSlug, 'Demo Movie', 'A demo movie for testing.', 120, 'English', 'Drama', 'UA']);
      movieId = ins.rows[0].id;
    }

    // show
    const sr2 = await client.query('SELECT id FROM shows WHERE movie_id=$1 AND auditorium_id=$2', [movieId, auditoriumId]);
    if (!sr2.rows.length) {
      const now = new Date();
      const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 120 * 60 * 1000);
      const open = new Date(now.getTime() - 60 * 60 * 1000);
      const close = new Date(start.getTime() - 15 * 60 * 1000);
      const showIns = await client.query(`INSERT INTO shows (movie_id, auditorium_id, starts_at, ends_at, booking_opens_at, booking_closes_at, status)
        VALUES ($1,$2,$3,$4,$5,$6,'scheduled') RETURNING id`,
        [movieId, auditoriumId, start.toISOString(), end.toISOString(), open.toISOString(), close.toISOString()]);
      const showId = showIns.rows[0].id;

      const cats = await client.query('SELECT id, name FROM seat_categories');
      for (const c of cats.rows) {
        const amount = c.name === 'Recliner' ? 50000 : c.name === 'Prime' ? 30000 : c.name === 'Handicapped' ? 20000 : 15000;
        await client.query('INSERT INTO show_seat_prices (show_id, category_id, amount_minor, currency) VALUES ($1,$2,$3,$4)',
          [showId, c.id, amount, 'INR']);
      }

      const seats = await client.query('SELECT id, category_id FROM seats WHERE layout_version_id=$1', [versionId]);
      for (const s of seats.rows) {
        const price = await client.query('SELECT amount_minor FROM show_seat_prices WHERE show_id=$1 AND category_id=$2', [showId, s.category_id]);
        const amt = price.rows.length ? price.rows[0].amount_minor : 15000;
        await client.query('INSERT INTO show_seats (show_id, seat_id, status, price_minor, currency) VALUES ($1,$2,$3,$4,$5)',
          [showId, s.id, 'available', amt, 'INR']);
      }
    }

    await client.query('COMMIT');
    console.log('seed complete');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });