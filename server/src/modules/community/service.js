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

export const DEFAULT_MEMBERSHIP = { label: 'Annual membership', amountMinor: 120000 };

/** The single membership price, managed from the admin app. */
export async function getMembershipPlan() {
  const { rows } = await pool.query("SELECT value FROM community_settings WHERE key='membership'");
  const value = rows[0]?.value || {};
  const amountMinor = Number(value.amountMinor);
  return {
    label: value.label || DEFAULT_MEMBERSHIP.label,
    amountMinor:
      Number.isFinite(amountMinor) && amountMinor >= 1000
        ? amountMinor
        : DEFAULT_MEMBERSHIP.amountMinor,
  };
}

export async function setMembershipAmount(amountMinor) {
  const amount = Math.round(Number(amountMinor));
  if (!Number.isFinite(amount) || amount < 1000) throw badRequest('amount must be at least ₹10');
  if (amount > 10000000) throw badRequest('amount is too large');

  const plan = { ...DEFAULT_MEMBERSHIP, amountMinor: amount };
  await pool.query(
    `INSERT INTO community_settings (key, value, updated_at)
     VALUES ('membership', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value=$1::jsonb, updated_at=now()`,
    [JSON.stringify(plan)],
  );
  return plan;
}

/** Background artwork for event tickets, set from the admin gallery. */
export async function getEventTicketSettings() {
  const { rows } = await pool.query("SELECT value FROM community_settings WHERE key='event_ticket'");
  return { backgroundUrl: rows[0]?.value?.backgroundUrl || '' };
}

export async function setEventTicketBackground(backgroundUrl) {
  const url = String(backgroundUrl || '').trim();
  if (url && !/^https?:\/\//i.test(url)) {
    throw badRequest('background must be an http(s) image url');
  }
  const value = { backgroundUrl: url };
  await pool.query(
    `INSERT INTO community_settings (key, value, updated_at)
     VALUES ('event_ticket', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value=$1::jsonb, updated_at=now()`,
    [JSON.stringify(value)],
  );
  return value;
}

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
  const [hero, events, notices, members, membership, eventTicket] = await Promise.all([
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
    getMembershipPlan(),
    getEventTicketSettings(),
  ]);

  return {
    hero: hero.rows,
    events: events.rows.map(eventRow),
    notices: notices.rows.map(noticeRow),
    membership,
    eventTicket,
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
  const plan = await getMembershipPlan();
  const { rows } = await pool.query(
    `INSERT INTO community_members (user_id, name, email, phone, plan, amount_minor, status, note)
     VALUES ($1,$2,$3,$4,'annual',$5,$6,$7)
     RETURNING *`,
    [
      data.userId || null,
      String(data.name).trim(),
      data.email || null,
      data.phone || null,
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
      'annual',
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

/** Keeps one membership row per account (partial unique index on user_id). */
export async function upsertMembershipForUser({ userId, name, phone, email, amountMinor, status = 'active', note }) {
  const existing = await pool.query('SELECT id FROM community_members WHERE user_id=$1', [userId]);
  if (existing.rows.length) {
    const { rows } = await pool.query(
      `UPDATE community_members
          SET name=coalesce($2, name), phone=coalesce($3, phone), email=coalesce($4, email),
              plan='annual', amount_minor=$5, status=$6, note=coalesce($7, note), updated_at=now()
        WHERE user_id=$1
        RETURNING *`,
      [userId, name || null, phone || null, email || null, amountMinor, status, note || null],
    );
    return memberRow(rows[0]);
  }

  const { rows } = await pool.query(
    `INSERT INTO community_members (user_id, name, email, phone, plan, amount_minor, status, note)
     VALUES ($1,$2,$3,$4,'annual',$5,$6,$7)
     RETURNING *`,
    [userId, name || 'Member', email || null, phone || null, amountMinor, status, note || null],
  );
  return memberRow(rows[0]);
}

/* ----------------------------------------------------- membership checkout */

function membershipOrderRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    amountMinor: row.amount_minor,
    baseAmountMinor: row.base_amount_minor,
    currency: row.currency,
    status: row.status,
    utr: row.utr,
    orderId: row.provider_order_id,
    paymentId: row.provider_payment_id,
    createdAt: row.created_at,
  };
}

async function findMembershipOrder(orderId) {
  const { rows } = await pool.query(
    'SELECT * FROM community_membership_orders WHERE provider_order_id=$1',
    [orderId],
  );
  if (!rows.length) throw notFound('membership checkout not found');
  return rows[0];
}

/** Start a YOUPI checkout for the single annual membership. */
export async function createMembershipCheckout({ userId, name, phone, publicBase }) {
  const plan = await getMembershipPlan();
  const { rows: people } = await pool.query(
    'SELECT email, mobile, display_name FROM users WHERE id=$1',
    [userId],
  );
  const profile = people[0];
  if (!profile) throw notFound('account not found');

  const buyerName = String(name || profile.display_name || '').trim() || 'Member';
  const buyerPhone = String(phone || profile.mobile || '').trim();
  if (!buyerPhone) throw badRequest('a contact number is required');

  const baseMinor = plan.amountMinor;
  const { rows: open } = await pool.query(
    `SELECT amount_minor FROM community_membership_orders
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

  const orderId = `member_${randomToken(8)}`;
  const appOrigin = (env.APP_BASE_URL || publicBase || '').replace(/\/$/, '');
  const session = await createYoupiSession({
    orderId,
    amountMinor: payableMinor,
    currency: 'INR',
    description: `Konkani Samudai membership · ${buyerName}`,
    returnUrl: `${appOrigin}/?membership=${orderId}`,
    metadata: { membershipOrderId: orderId, userId },
    customer: { fullName: buyerName, phone: buyerPhone, email: profile.email || undefined },
  });

  const { rows } = await pool.query(
    `INSERT INTO community_membership_orders
       (user_id, name, phone, email, amount_minor, base_amount_minor,
        provider_order_id, provider_payment_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'created')
     RETURNING *`,
    [
      userId,
      buyerName,
      buyerPhone,
      profile.email || null,
      payableMinor,
      baseMinor,
      orderId,
      session.paymentId || null,
    ],
  );

  const base = (publicBase || '').replace(/\/$/, '');
  return {
    order: membershipOrderRow(rows[0]),
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
    plan,
  };
}

export async function getMembershipCheckout(orderId, userId) {
  const row = await findMembershipOrder(orderId);
  if (row.user_id !== userId) throw notFound('membership checkout not found');

  let status = row.status;
  let providerStatus = null;

  if (row.provider_payment_id && status === 'created') {
    try {
      const provider = await getYoupiStatus(row.provider_payment_id);
      providerStatus = String(provider.status || '').toUpperCase();
      if (providerStatus === 'SUCCESS') {
        await pool.query(
          "UPDATE community_membership_orders SET status='paid', updated_at=now() WHERE id=$1",
          [row.id],
        );
        await upsertMembershipForUser({
          userId: row.user_id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          amountMinor: row.base_amount_minor,
          status: 'active',
        });
        status = 'paid';
      } else if (providerStatus === 'FAILED' || providerStatus === 'EXPIRED') {
        status = providerStatus.toLowerCase();
        await pool.query(
          'UPDATE community_membership_orders SET status=$2, updated_at=now() WHERE id=$1',
          [row.id, status],
        );
      }
    } catch {
      // Keep it created; the client retries.
    }
  }

  return {
    order: { ...membershipOrderRow(row), status },
    status,
    providerStatus,
    member: status === 'paid' ? await getMembershipForUser(userId) : null,
  };
}

export async function confirmMembershipCheckout(orderId, userId, { utr } = {}) {
  const row = await findMembershipOrder(orderId);
  if (row.user_id !== userId) throw notFound('membership checkout not found');
  if (row.status === 'paid') {
    return { success: true, member: await getMembershipForUser(userId) };
  }
  if (!row.provider_payment_id) throw badRequest('this checkout has no payment session');

  const provider = await getYoupiStatus(row.provider_payment_id);
  if (String(provider.status || '').toUpperCase() !== 'SUCCESS') {
    return { success: false, status: provider.status };
  }
  if (provider.amountPaise && Number(provider.amountPaise) !== Number(row.amount_minor)) {
    throw badRequest('payment amount mismatch');
  }

  await pool.query(
    `UPDATE community_membership_orders
        SET status='paid', utr=coalesce($2, utr), updated_at=now()
      WHERE id=$1`,
    [row.id, utr || null],
  );

  const member = await upsertMembershipForUser({
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    amountMinor: row.base_amount_minor,
    status: 'active',
  });
  return { success: true, member };
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
    eventDate: row.event_date,
    eventTime: row.event_time,
    venue: row.venue,
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
       (event_id, event_title, event_date, event_time, venue, tier_id, tier_name, quantity,
        amount_minor, base_amount_minor, currency, buyer_name, phone,
        provider_order_id, provider_payment_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'INR',$11,$12,$13,$14,'created')
     RETURNING *`,
    [
      event.id,
      event.title,
      event.dateLabel,
      event.timeLabel,
      event.venue,
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
