import { pool } from '../../db/pool.js';
import { notFound } from '../../utils/errors.js';

export async function listTheatres() {
  const { rows } = await pool.query('SELECT * FROM theatres WHERE status=$1', ['active']);
  return rows;
}

export async function listAuditoriums(theatreId) {
  const { rows } = await pool.query('SELECT * FROM auditoriums WHERE theatre_id=$1', [theatreId]);
  return rows;
}

export async function listCategories() {
  const { rows } = await pool.query('SELECT * FROM seat_categories ORDER BY name');
  return rows;
}

export async function getLayout(auditoriumId, versionId) {
  let v = versionId;
  if (!v) {
    const a = await pool.query('SELECT active_layout_version_id FROM auditoriums WHERE id=$1', [auditoriumId]);
    if (!a.rows.length) throw notFound();
    v = a.rows[0].active_layout_version_id;
  }
  const seats = await pool.query('SELECT s.*, sc.name AS category_name FROM seats s LEFT JOIN seat_categories sc ON sc.id=s.category_id WHERE s.layout_version_id=$1 ORDER BY s.y,s.x', [v]);
  return { versionId: v, seats: seats.rows };
}
