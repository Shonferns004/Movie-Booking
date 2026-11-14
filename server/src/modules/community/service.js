import { pool } from '../../db/pool.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { env } from '../../config/env.js';
import { randomToken } from '../../utils/crypto.js';
import { createYoupiSession, getYoupiStatus } from '../payments/service.js';

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
      data.accent || '#F5C542',
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

/* --------------------------------------------------------- event tickets */

function ticketOrderRow(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    eventTitle: row.event_title,
    tierId: row.tier_id,
    tierName: row.tier_name,
    quantity: row.quantity,
    amountMinor: row.amount_minor,
    baseAmountMinor: row.base_amount_minor,
    currency: row.currency,
    buyerName: row.buyer_name,
    phone: row.phone,
    status: row.status,
    utr: row.utr,
    orderId: row.provider_order_id,
    paymentId: row.provider_payment_id,
    createdAt: row.created_at,
  };
}

async function findTicketOrder(orderId) {
  const { rows } = await pool.query(
    'SELECT * FROM community_ticket_orders WHERE provider_order_id=$1',
    [orderId],
  );
  if (!rows.length) throw notFound('checkout not found');
  return rows[0];
}

/**
 * Start a YOUPI checkout for an event pass. The payable amount gets a unique paise
 * offset, exactly like movie bookings, so two identical orders never collide.
 */
export async function createTicketCheckout({ eventId, tierId, quantity, name, phone, userId, publicBase }) {
  const { rows } = await pool.query('SELECT * FROM community_events WHERE id=$1', [eventId]);
  if (!rows.length) throw notFound('event not found');

  // A signed-in visitor should never be asked for details again.
  let profile = null;
  if (userId) {
    const { rows: people } = await pool.query(
      'SELECT email, mobile, display_name FROM users WHERE id=$1',
      [userId],
    );
    profile = people[0] || null;
  }
  const buyerName = String(name || profile?.display_name || '').trim() || null;
  const buyerPhone = String(phone || profile?.mobile || '').trim() || null;
  const buyerEmail = profile?.email || null;

  const event = eventRow(rows[0]);
  const tiers = asTiers(event.tiers);
  const tier = tiers.find((item) => String(item.id) === String(tierId)) || tiers[0];
  if (!tier) throw badRequest('this event has no ticket tiers');

  const qty = Math.max(1, Math.min(10, Number(quantity) || 1));
  const price = Number(tier.price);
  if (!Number.isFinite(price) || price <= 0) throw badRequest('this event has no valid price');
  const baseMinor = Math.round(price * 100) * qty;

  const { rows: open } = await pool.query(
    `SELECT amount_minor FROM community_ticket_orders
      WHERE status='created' AND created_at > now() - interval '15 minutes'`,
  );
  const used = new Set(open.map((row) => Number(row.amount_minor)));
  let payableMinor = baseMinor;
  for (let offset = 1; offset <= 99; offset += 1) {
    if (!used.has(baseMinor + offset)) {
      payableMinor = baseMinor + offset;
      break;
    }
  }

  const orderId = `event_${randomToken(8)}`;
  const appOrigin = (env.APP_BASE_URL || publicBase || '').replace(/\/$/, '');
  const session = await createYoupiSession({
    orderId,
    amountMinor: payableMinor,
    currency: 'INR',
    description: `${event.title} · ${tier.name || 'Entry'} × ${qty}`,
    returnUrl: `${appOrigin}/?paid=${orderId}`,
    metadata: { communityOrderId: orderId, eventId: event.id, tierId: tier.id, quantity: qty },
    customer: { fullName: buyerName, phone: buyerPhone, email: buyerEmail },
  });

  const { rows: saved } = await pool.query(
    `INSERT INTO community_ticket_orders
       (event_id, event_title, tier_id, tier_name, quantity, amount_minor, base_amount_minor,
        currency, buyer_name, phone, provider_order_id, provider_payment_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'INR',$8,$9,$10,$11,'created')
     RETURNING *`,
    [
      event.id,
      event.title,
      String(tier.id || ''),
      tier.name || 'Entry',
      qty,
      payableMinor,
      baseMinor,
      buyerName,
      buyerPhone,
      orderId,
      session.paymentId || null,
    ],
  );

  const base = (publicBase || '').replace(/\/$/, '');
  return {
    order: ticketOrderRow(saved[0]),
    orderId,
    paymentId: session.paymentId || null,
    amount: (payableMinor / 100).toFixed(2),
    amountMinor: payableMinor,
    baseAmountMinor: baseMinor,
    currency: 'INR',
    checkoutUrl: session.paymentId ? `${base}/checkout/${session.paymentId}` : '',
    scriptUrl: `${base}/youpi.js?v=2`,
    apiUrl: `${base}/youpi`,
    portalUrl: base,
    merchantKey: env.YOUPI_MERCHANT_ID || '',
    upiId: env.YOUPI_UPI_ID || '',
    eventTitle: event.title,
    tierName: tier.name || 'Entry',
    quantity: qty,
  };
}

/** Ask the gateway whether an event checkout has been paid yet. */
export async function getTicketCheckout(orderId) {
  const row = await findTicketOrder(orderId);
  let status = row.status;
  let providerStatus = null;

  if (row.provider_payment_id && (status === 'created' || status === 'pending')) {
    try {
      const provider = await getYoupiStatus(row.provider_payment_id);
      providerStatus = String(provider.status || '').toUpperCase();
      if (providerStatus === 'SUCCESS') {
        await pool.query(
          "UPDATE community_ticket_orders SET status='paid', updated_at=now() WHERE id=$1",
          [row.id],
        );
        status = 'paid';
      } else if (providerStatus === 'FAILED' || providerStatus === 'EXPIRED') {
        status = providerStatus.toLowerCase();
        await pool.query(
          'UPDATE community_ticket_orders SET status=$2, updated_at=now() WHERE id=$1',
          [row.id, status],
        );
      }
    } catch {
      // Keep the row as "created" and let the client poll again.
    }
  }

  return {
    order: { ...ticketOrderRow(row), status },
    status,
    providerStatus,
  };
}

/** Client-side success callback: re-check with the gateway before marking paid. */
export async function confirmTicketCheckout(orderId, { utr } = {}) {
  const row = await findTicketOrder(orderId);
  if (row.status === 'paid') return { success: true, order: ticketOrderRow(row) };
  if (!row.provider_payment_id) throw badRequest('this checkout has no payment session');

  const provider = await getYoupiStatus(row.provider_payment_id);
  if (String(provider.status || '').toUpperCase() !== 'SUCCESS') {
    return { success: false, status: provider.status };
  }
  if (provider.amountPaise && Number(provider.amountPaise) !== Number(row.amount_minor)) {
    throw badRequest('payment amount mismatch');
  }

  const { rows } = await pool.query(
    `UPDATE community_ticket_orders
        SET status='paid', utr=coalesce($2, utr), updated_at=now()
      WHERE id=$1
      RETURNING *`,
    [row.id, utr || null],
  );
  return { success: true, order: ticketOrderRow(rows[0]) };
}

/** Name/email used when a signed-in visitor subscribes. */
export async function getUserProfile(userId) {
  const { rows } = await pool.query(
    'SELECT email, display_name FROM users WHERE id=$1',
    [userId],
  );
  return rows[0] || null;
}
