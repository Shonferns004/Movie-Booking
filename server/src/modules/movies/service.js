import { pool } from '../../db/pool.js';
import { notFound, badRequest } from '../../utils/errors.js';

export async function listPublished() {
  const { rows } = await pool.query(`
    SELECT m.*, (SELECT url FROM movie_media WHERE movie_id=m.id AND media_type='poster' ORDER BY display_order, created_at DESC LIMIT 1) AS thumbnail_url
    FROM movies m WHERE m.status='published' ORDER BY m.created_at DESC`);
  return rows;
}

export async function getById(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw notFound('movie not found');
  const { rows } = await pool.query('SELECT * FROM movies WHERE id=$1', [id]);
  if (!rows.length) throw notFound('movie not found');
  const media = await pool.query(
    'SELECT * FROM movie_media WHERE movie_id=$1 ORDER BY display_order, created_at DESC',
    [id],
  );
  return { ...rows[0], media: media.rows };
}

export async function getBySlug(slug) {
  const { rows } = await pool.query('SELECT * FROM movies WHERE slug=$1', [slug]);
  if (!rows.length) throw notFound('movie not found');
  return getById(rows[0].id);
}

export async function addMedia(movieId, type, url) {
  if (type === 'poster') {
    // New posters take the first slot so list/detail thumbnails update immediately.
    await pool.query(
      'UPDATE movie_media SET display_order = display_order + 1 WHERE movie_id=$1 AND media_type=$2',
      [movieId, type],
    );
  }
  await pool.query('INSERT INTO movie_media (movie_id, media_type, url, display_order) VALUES ($1,$2,$3,$4)',
    [movieId, type, url, 0]);
  return { url };
}

export async function createMovie(data) {
  const { rows } = await pool.query(
    `INSERT INTO movies (slug,title,synopsis,duration_minutes,language,genre,certification,release_date,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [data.slug, data.title, data.synopsis || null, data.durationMinutes, data.language || null, data.genre || null,
     data.certification || null, data.releaseDate || null, data.status || 'draft']);
  const movie = rows[0];
  if (data.thumbnailUrl) {
    await pool.query('INSERT INTO movie_media (movie_id, media_type, url, display_order) VALUES ($1,$2,$3,$4)',
      [movie.id, 'poster', data.thumbnailUrl, 0]);
  }
  if (data.trailerUrl) {
    await pool.query('INSERT INTO movie_media (movie_id, media_type, url, display_order) VALUES ($1,$2,$3,$4)',
      [movie.id, 'trailer', data.trailerUrl, 1]);
  }
  return movie;
}

export async function updateMovie(id, data) {
  const existing = await pool.query('SELECT * FROM movies WHERE id=$1', [id]);
  if (!existing.rows.length) throw notFound();
  const m = existing.rows[0];
  const { rows } = await pool.query(
    `UPDATE movies SET slug=$1,title=$2,synopsis=$3,duration_minutes=$4,language=$5,genre=$6,certification=$7,release_date=$8,status=$9,updated_at=now()
     WHERE id=$10 RETURNING *`,
    [data.slug ?? m.slug, data.title ?? m.title, data.synopsis ?? m.synopsis, data.durationMinutes ?? m.duration_minutes,
     data.language ?? m.language, data.genre ?? m.genre, data.certification ?? m.certification,
     data.releaseDate ?? m.release_date, data.status ?? m.status, id]);
  return rows[0];
}
