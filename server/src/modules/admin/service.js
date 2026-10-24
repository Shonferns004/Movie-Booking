import { pool, withTransaction } from '../../db/pool.js';
import { notFound, badRequest } from '../../utils/errors.js';

/**
 * Theatre / auditorium / seat-layout administration.
 *
 * Writes into the canonical booking schema (theatres, auditoriums,
 * seat_layout_versions, seats) so the seat builder in /admin feeds the
 * same data the booking flow reads.
 */

// ---------------------------------------------------------------- theatres

export async function listTheatres() {
  const { rows } = await pool.query(`
    SELECT t.*,
           COUNT(DISTINCT a.id)::int AS auditorium_count
      FROM theatres t
      LEFT JOIN auditoriums a ON a.theatre_id = t.id
     GROUP BY t.id
     ORDER BY t.created_at DESC
  `);
  return rows;
}

export async function createTheatre({ name, address, timezone }) {
  if (!name || !String(name).trim()) throw badRequest('Theatre name is required');
  const { rows } = await pool.query(
    `INSERT INTO theatres (name, address, timezone)
     VALUES ($1, $2, COALESCE($3, 'Asia/Kolkata'))
     RETURNING *`,
    [String(name).trim(), address || null, timezone || null]
  );
  return rows[0];
}

export async function updateTheatre(id, { name, address, timezone, status }) {
  const { rows } = await pool.query(
    `UPDATE theatres SET
       name      = COALESCE($2, name),
       address   = COALESCE($3, address),
       timezone  = COALESCE($4, timezone),
       status    = COALESCE($5, status),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, name || null, address ?? null, timezone || null, status || null]
  );
  if (!rows.length) throw notFound('Theatre not found');
  return rows[0];
}

export async function deleteTheatre(id) {
  const { rowCount } = await pool.query('DELETE FROM theatres WHERE id = $1', [id]);
  if (!rowCount) throw notFound('Theatre not found');
  return { deleted: true };
}

// ------------------------------------------------------------- auditoriums

export async function listAuditoriums(theatreId) {
  const { rows } = await pool.query(
    `SELECT a.*,
            v.version             AS active_version,
            v.import_status       AS layout_status,
            (SELECT COUNT(*)::int FROM seats s WHERE s.layout_version_id = a.active_layout_version_id) AS seat_count
       FROM auditoriums a
       LEFT JOIN seat_layout_versions v ON v.id = a.active_layout_version_id
      WHERE a.theatre_id = $1
      ORDER BY a.created_at`,
    [theatreId]
  );
  return rows;
}

export async function createAuditorium(theatreId, { name }) {
  if (!name || !String(name).trim()) throw badRequest('Auditorium name is required');
  const theatre = await pool.query('SELECT 1 FROM theatres WHERE id = $1', [theatreId]);
  if (!theatre.rowCount) throw notFound('Theatre not found');
  const { rows } = await pool.query(
    `INSERT INTO auditoriums (theatre_id, name) VALUES ($1, $2) RETURNING *`,
    [theatreId, String(name).trim()]
  );
  return rows[0];
}

export async function updateAuditorium(id, { name, status }) {
  const { rows } = await pool.query(
    `UPDATE auditoriums SET
       name = COALESCE($2, name),
       status = COALESCE($3, status),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, name || null, status || null]
  );
  if (!rows.length) throw notFound('Auditorium not found');
  return rows[0];
}

export async function deleteAuditorium(id) {
  const { rowCount } = await pool.query('DELETE FROM auditoriums WHERE id = $1', [id]);
  if (!rowCount) throw notFound('Auditorium not found');
  return { deleted: true };
}

// ------------------------------------------------------------ seat layouts

export async function getLayout(auditoriumId) {
  const auditorium = await pool.query(
    'SELECT a.*, t.name AS theatre_name FROM auditoriums a JOIN theatres t ON t.id = a.theatre_id WHERE a.id = $1',
    [auditoriumId]
  );
  if (!auditorium.rowCount) throw notFound('Auditorium not found');

  const a = auditorium.rows[0];
  let version = null;
  let seats = [];

  if (a.active_layout_version_id) {
    const v = await pool.query('SELECT * FROM seat_layout_versions WHERE id = $1', [a.active_layout_version_id]);
    version = v.rows[0] || null;
    const s = await pool.query(
      `SELECT s.*, sc.name AS category_name
         FROM seats s
         LEFT JOIN seat_categories sc ON sc.id = s.category_id
        WHERE s.layout_version_id = $1
        ORDER BY s.y, s.x`,
      [a.active_layout_version_id]
    );
    seats = s.rows;
  }

  return { auditorium: a, version, seats };
}

/**
 * Persists a seat grid as a brand-new layout version and makes it active.
 *
 * @param {string} auditoriumId
 * @param {{ rows: number, cols: number, grid: Array<Array<{type: string, label?: string}>> }} layout
 */
export async function saveLayout(auditoriumId, { rows, cols, grid }) {
  if (!Array.isArray(grid) || !grid.length) throw badRequest('grid is required');

  const auditorium = await pool.query('SELECT * FROM auditoriums WHERE id = $1', [auditoriumId]);
  if (!auditorium.rowCount) throw notFound('Auditorium not found');

  const categories = await pool.query('SELECT id, name FROM seat_categories');
  const categoryByName = new Map(categories.rows.map((r) => [r.name.toLowerCase(), r.id]));

  return withTransaction(async (client) => {
    const { rows: vRows } = await client.query(
      'SELECT COALESCE(MAX(version), 0)::int AS v FROM seat_layout_versions WHERE auditorium_id = $1',
      [auditoriumId]
    );
    const nextVersion = vRows[0].v + 1;

    const { rows: created } = await client.query(
      `INSERT INTO seat_layout_versions (auditorium_id, version, import_status, approved_at, source_file_name)
       VALUES ($1, $2, 'approved', now(), 'admin-seat-builder')
       RETURNING *`,
      [auditoriumId, nextVersion]
    );
    const version = created[0];

    // seat_type values understood by the booking UI. 'gap' / 'empty' cells are
    // not seats, so they are skipped entirely.
    const TYPE_MAP = {
      standard: 'seat',
      premium: 'seat',
      recliner: 'seat',
      wheelchair: 'seat',
      disabled: 'seat',
      gap: 'gap',
      empty: null
    };
    const CATEGORY_MAP = {
      standard: 'classic',
      premium: 'prime',
      recliner: 'recliner',
      wheelchair: 'handicapped',
      disabled: 'handicapped'
    };

    let seatCount = 0;
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      if (!Array.isArray(row)) continue;
      for (let x = 0; x < row.length; x++) {
        const cell = row[x];
        if (!cell || !cell.type) continue;
        const seatType = TYPE_MAP[cell.type];
        if (!seatType) continue;

        const rowLabel = cell.row_label || '';
        const seatNumber = String(cell.seat_number || x + 1);
        const seatKey = cell.label || (rowLabel ? `${rowLabel}${seatNumber}` : seatNumber);
        const colSpan = Number(cell.col_span) > 1 ? Number(cell.col_span) : 1;
        const categoryId = categoryByName.get(CATEGORY_MAP[cell.type]) || null;

        await client.query(
          `INSERT INTO seats
             (auditorium_id, layout_version_id, seat_key, row_label, seat_number,
              x, y, category_id, seat_type, status, accessible, col_span)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (layout_version_id, seat_key) DO NOTHING`,
          [
            auditoriumId,
            version.id,
            seatKey,
            rowLabel,
            seatNumber,
            x,
            y,
            categoryId,
            seatType,
            seatType === 'gap' ? 'gap' : 'active',
            cell.type === 'wheelchair' || cell.type === 'disabled'
            ? (cell.type === 'wheelchair') : false,
          colSpan,
          ]
        );
        seatCount += 1;
      }
    }

    await client.query(
      'UPDATE auditoriums SET active_layout_version_id = $1, updated_at = now() WHERE id = $2',
      [version.id, auditoriumId]
    );

    return { version, rows: grid.length, cols: cols || grid[0].length, seatCount };
  });
}

// --------------------------------------------------------- seat categories

export async function listCategories() {
  const { rows } = await pool.query('SELECT * FROM seat_categories ORDER BY name');
  return rows;
}

export async function createCategory({ name, description }) {
  if (!name || !String(name).trim()) throw badRequest('Category name is required');
  const { rows } = await pool.query(
    `INSERT INTO seat_categories (name, description)
     VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET description = COALESCE(EXCLUDED.description, seat_categories.description)
     RETURNING *`,
    [String(name).trim(), description || null]
  );
  return rows[0];
}


