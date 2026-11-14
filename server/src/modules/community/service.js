import { pool } from '../../db/pool.js';
import { badRequest, notFound } from '../../utils/errors.js';

/**
 * Community content: events, notices, hero images and members.
 *
 * The public landing page reads everything through `getPublicPage()`; the admin app
 * manages it through the functions below.
 */

export const MEMBERSHIP_PLANS = {
  single: { label: 'Single', amountMinor: 60000 },
  family: { label: 'Family', amountMinor: 120000 },
  patron: { label: 'Patron', amountMinor: 500000 },
};

const asTiers = (value) => (Array.isArray(value) ? value : []);

function eventRow(row) {
  return {
    id: row.id,
    title: row.title,
    kicker: row.kicker,
    startsAt: row.starts_at,
    dateLabel: row.date_label,
    timeLabel: row.time_label,
    venue: row.venue,
    blurb: row.blurb,
    tags: Array.isArray(row.tags) ? row.tags : [],
    accent: row.accent,
    tiers: asTiers(row.tiers),
    published: row.published,
    sortOrder: row.sort_order,
  };
}

function noticeRow(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    tag: row.tag,
    dateLabel: row.date_label,
    published: row.published,
    sortOrder: row.sort_order,
  };
}

function memberRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    plan: row.plan,
    amountMinor: row.amount_minor,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------------ public */

export async function getPublicPage() {
  const [hero, events, notices, members] = await Promise.all([
    pool.query(
      `SELECT id, url, caption FROM hero_images
        WHERE active = TRUE ORDER BY sort_order, created_at`,
    ),
    pool.query(
      `SELECT * FROM community_events
        WHERE published = TRUE ORDER BY sort_order, coalesce(starts_at, now())`,
    ),
    pool.query(
      `SELECT * FROM community_notices
        WHERE published = TRUE ORDER BY sort_order, created_at DESC LIMIT 20`,
    ),
    pool.query('SELECT count(*)::int AS n FROM community_members'),
  ]);

  return {
    hero: hero.rows,
    events: events.rows.map(eventRow),
    notices: notices.rows.map(noticeRow),
    stats: {
      members: members.rows[0]?.n ?? 0,
      events: events.rows.length,
      notices: notices.rows.length,
    },
  };
}

/* ------------------------------------------------------------------- hero */

export async function listHero() {
  const { rows } = await pool.query(
    'SELECT id, url, caption, sort_order, active FROM hero_images ORDER BY sort_order, created_at',
  );
  return rows;
}

export async function addHero({ url, caption }) {
  if (!url || !String(url).trim()) throw badRequest('image url is required');
  const { rows } = await pool.query(
    `INSERT INTO hero_images (url, caption, sort_order)
     VALUES ($1, $2, coalesce((SELECT max(sort_order) + 1 FROM hero_images), 0))
     RETURNING id, url, caption, sort_order, active`,
    [String(url).trim(), caption || null],
  );
  return rows[0];
}

export async function deleteHero(id) {
  const { rowCount } = await pool.query('DELETE FROM hero_images WHERE id=$1', [id]);
  if (!rowCount) throw notFound('hero image not found');
  return { deleted: true };
}

/* ----------------------------------------------------------------- events */

export async function listEvents() {
  const { rows } = await pool.query(
    'SELECT * FROM community_events ORDER BY sort_order, coalesce(starts_at, now())',
  );
  return rows.map(eventRow);
}

export async function createEvent(data) {
  if (!data?.title || !String(data.title).trim()) throw badRequest('title is required');
  const { rows } = await pool.query(
    `INSERT INTO community_events
       (title, kicker, starts_at, date_label, time_label, venue, blurb, tags, accent, tiers, published, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
             coalesce($12, (SELECT max(sort_order) + 1 FROM community_events), 0))
     RETURNING *`,
    [
      String(data.title).trim(),
      data.kicker || null,
      data.startsAt || null,
      data.dateLabel || null,
      data.timeLabel || null,
      data.venue || null,
      data.blurb || null,
      Array.isArray(data.tags) ? data.tags : [],
      data.accent || '#F5B841',
      JSON.stringify(asTiers(data.tiers)),
      data.published !== false,
      data.sortOrder ?? null,
    ],
  );
  return eventRow(rows[0]);
}

export async function updateEvent(id, data) {
  const { rows } = await pool.query(
    `UPDATE community_events SET
       title = coalesce($2, title),
       kicker = coalesce($3, kicker),
       starts_at = coalesce($4, starts_at),
       date_label = coalesce($5, date_label),
       time_label = coalesce($6, time_label),
       venue = coalesce($7, venue),
       blurb = coalesce($8, blurb),
       tags = coalesce($9, tags),
       accent = coalesce($10, accent),
       tiers = coalesce($11, tiers),
       published = coalesce($12, published),
       sort_order = coalesce($13, sort_order),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      data.title ?? null,
      data.kicker ?? null,
      data.startsAt ?? null,
      data.dateLabel ?? null,
      data.timeLabel ?? null,
      data.venue ?? null,
      data.blurb ?? null,
      Array.isArray(data.tags) ? data.tags : null,
      data.accent ?? null,
      data.tiers ? JSON.stringify(asTiers(data.tiers)) : null,
      typeof data.published === 'boolean' ? data.published : null,
      data.sortOrder ?? null,
    ],
  );
  if (!rows.length) throw notFound('event not found');
  return eventRow(rows[0]);
}

export async function deleteEvent(id) {
  const { rowCount } = await pool.query('DELETE FROM community_events WHERE id=$1', [id]);
  if (!rowCount) throw notFound('event not found');
  return { deleted: true };
}

/* ---------------------------------------------------------------- notices */

export async function listNotices() {
  const { rows } = await pool.query(
    'SELECT * FROM community_notices ORDER BY sort_order, created_at DESC',
  );
  return rows.map(noticeRow);
}

export async function createNotice(data) {
  if (!data?.title || !String(data.title).trim()) throw badRequest('title is required');
  const { rows } = await pool.query(
    `INSERT INTO community_notices (title, body, tag, date_label, published, sort_order)
     VALUES ($1,$2,$3,$4,$5,
             coalesce($6, (SELECT max(sort_order) + 1 FROM community_notices), 0))
     RETURNING *`,
    [
      String(data.title).trim(),
      data.body || null,
      data.tag || null,
      data.dateLabel || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      data.published !== false,
      data.sortOrder ?? null,
    ],
  );
  return noticeRow(rows[0]);
}

export async function deleteNotice(id) {
  const { rowCount } = await pool.query('DELETE FROM community_notices WHERE id=$1', [id]);
  if (!rowCount) throw notFound('notice not found');
  return { deleted: true };
}

/* ---------------------------------------------------------------- members */

export async function listMembers() {
  const { rows } = await pool.query(
    'SELECT * FROM community_members ORDER BY created_at DESC',
  );
  return rows.map(memberRow);
}

export async function createMember(data) {
  if (!data?.name || !String(data.name).trim()) throw badRequest('name is required');
  const planKey = MEMBERSHIP_PLANS[data.plan] ? data.plan : 'family';
  const plan = MEMBERSHIP_PLANS[planKey];
  const { rows } = await pool.query(
    `INSERT INTO community_members (user_id, name, email, phone, plan, amount_minor, status, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      data.userId || null,
      String(data.name).trim(),
      data.email || null,
      data.phone || null,
      planKey,
      data.amountMinor ?? plan.amountMinor,
      data.status || 'active',
      data.note || null,
    ],
  );
  return memberRow(rows[0]);
}

export async function updateMember(id, data) {
  const { rows } = await pool.query(
    `UPDATE community_members SET
       name = coalesce($2, name),
       email = coalesce($3, email),
       phone = coalesce($4, phone),
       plan = coalesce($5, plan),
       amount_minor = coalesce($6, amount_minor),
       status = coalesce($7, status),
       note = coalesce($8, note),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      data.name ?? null,
      data.email ?? null,
      data.phone ?? null,
      MEMBERSHIP_PLANS[data.plan] ? data.plan : null,
      data.amountMinor ?? null,
      data.status ?? null,
      data.note ?? null,
    ],
  );
  if (!rows.length) throw notFound('member not found');
  return memberRow(rows[0]);
}

export async function deleteMember(id) {
  const { rowCount } = await pool.query('DELETE FROM community_members WHERE id=$1', [id]);
  if (!rowCount) throw notFound('member not found');
  return { deleted: true };
}

/** A signed-in visitor subscribes; one membership per account. */
export async function subscribeMember({ userId, plan, phone, name, email, note }) {
  const planKey = MEMBERSHIP_PLANS[plan] ? plan : 'family';
  const chosen = MEMBERSHIP_PLANS[planKey];

  const existing = await pool.query('SELECT * FROM community_members WHERE user_id=$1', [userId]);
  if (existing.rows.length) {
    const { rows } = await pool.query(
      `UPDATE community_members
          SET plan=$2, amount_minor=$3, phone=coalesce($4, phone), note=coalesce($5, note), updated_at=now()
        WHERE user_id=$1 RETURNING *`,
      [userId, planKey, chosen.amountMinor, phone || null, note || null],
    );
    return memberRow(rows[0]);
  }

  const { rows } = await pool.query(
    `INSERT INTO community_members (user_id, name, email, phone, plan, amount_minor, status, note)
     VALUES ($1,$2,$3,$4,$5,$6,'pending',$7)
     RETURNING *`,
    [userId, name || 'Member', email || null, phone || null, planKey, chosen.amountMinor, note || null],
  );
  return memberRow(rows[0]);
}

export async function getMembershipForUser(userId) {
  const { rows } = await pool.query('SELECT * FROM community_members WHERE user_id=$1', [userId]);
  return rows.length ? memberRow(rows[0]) : null;
}

/** Name/email used when a signed-in visitor subscribes. */
export async function getUserProfile(userId) {
  const { rows } = await pool.query(
    'SELECT email, display_name FROM users WHERE id=$1',
    [userId],
  );
  return rows[0] || null;
}
