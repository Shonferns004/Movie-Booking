import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import nodemailer from 'nodemailer';
import { publishDueMovies } from './publish.js';

const transporter = env.EMAIL_PROVIDER === 'smtp' ? nodemailer.createTransport({
  host: env.SMTP_HOST, port: env.SMTP_PORT, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
}) : null;

/** Release seat holds whose window has passed. */
export async function expireHolds() {
  const client = await pool.connect();
  let expired = 0;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id FROM seat_holds
       WHERE status='active' AND expires_at <= now()
         AND NOT EXISTS (
           SELECT 1 FROM bookings WHERE hold_id = seat_holds.id AND status IN ('pending','confirmed')
         )
       FOR UPDATE SKIP LOCKED`);
    for (const r of rows) {
      await client.query("UPDATE seat_holds SET status='expired', released_at=now() WHERE id=$1", [r.id]);
      await client.query("UPDATE show_seats SET status='available', hold_id=NULL, booking_id=NULL, updated_at=now() WHERE hold_id=$1", [r.id]);
      expired += 1;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('expireHolds error', e);
  } finally {
    client.release();
  }
  return expired;
}

/** Send queued emails (no-op logging when SMTP is not configured). */
export async function processOutbox() {
  const client = await pool.connect();
  let sent = 0;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM email_outbox WHERE status IN ('pending','retry') AND next_attempt_at <= now() ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED`);
    for (const msg of rows) {
      try {
        let providerMessageId = `console-${Date.now()}`;
        const isWhatsApp = String(msg.event_type || '').endsWith('_whatsapp');
        const gatewayBase = String(env.YOUPI_API_URL || '').replace(/\/$/, '');
        const hostedGateway = /^https?:\/\//.test(gatewayBase) && !/127\.0\.0\.1|localhost/i.test(gatewayBase);

        if (isWhatsApp && !hostedGateway) {
          // A development box shares the production database but not the deployed
          // WhatsApp gateway. Leave these for the production worker instead of
          // burning the retry budget against a local gateway with no movie tables.
          await client.query(
            "UPDATE email_outbox SET next_attempt_at=now() + interval '1 minute', updated_at=now() WHERE id=$1",
            [msg.id],
          );
          continue;
        }

        if (msg.event_type === 'ticket_whatsapp') {
          // Generate + send the PDF on the gateway host, which owns the WhatsApp socket.
          const base = String(env.YOUPI_API_URL || '').replace(/\/$/, '');
          if (!base) throw new Error('YOUPI_API_URL is not configured');
          const response = await fetch(`${base}/api/v1/internal/whatsapp/ticket`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Token': env.INTERNAL_CRON_SECRET || '',
            },
            body: JSON.stringify({
              bookingReference: msg.template_data?.bookingReference,
              mobile: msg.recipient,
            }),
            signal: AbortSignal.timeout(25000),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || data.success === false) {
            throw new Error(data.error || data.message || `WhatsApp ticket failed (${response.status})`);
          }
          providerMessageId = data.id || `whatsapp-${Date.now()}`;
        } else if (msg.event_type === 'membership_renewal_whatsapp'
          || msg.event_type === 'cancellation_whatsapp') {
          const base = String(env.YOUPI_API_URL || '').replace(/\/$/, '');
          if (!base) throw new Error('YOUPI_API_URL is not configured');
          const response = await fetch(`${base}/api/v1/internal/whatsapp/message`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Token': env.INTERNAL_CRON_SECRET || '',
            },
            body: JSON.stringify({
              to: msg.recipient,
              message: msg.template_data?.message || '',
            }),
            signal: AbortSignal.timeout(25000),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || data.success === false) {
            throw new Error(data.error || data.message || `WhatsApp message failed (${response.status})`);
          }
          providerMessageId = data.id || `whatsapp-${Date.now()}`;
        } else if (transporter) {
          await transporter.sendMail({ from: env.EMAIL_FROM, to: msg.recipient, subject: msg.event_type, text: JSON.stringify(msg.template_data) });
        } else {
          console.log('[email:console]', msg.event_type, msg.recipient, msg.template_data);
        }

        await client.query("UPDATE email_outbox SET status='sent', attempt_count=attempt_count+1, updated_at=now(), provider_message_id=$1 WHERE id=$2",
          [providerMessageId, msg.id]);
        sent += 1;
      } catch (err) {
        const attempts = msg.attempt_count + 1;
        const next = new Date(Date.now() + Math.min(300000, attempts * 30000));
        const status = attempts >= 5 ? 'failed' : 'retry';
        await client.query('UPDATE email_outbox SET status=$1, attempt_count=$2, next_attempt_at=$3, last_error=$4, updated_at=now() WHERE id=$5',
          [status, attempts, next.toISOString(), err.message, msg.id]);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('processOutbox error', e);
  } finally {
    client.release();
  }
  return sent;
}

/** Build a warm renewal message; Gemini when configured, template otherwise. */
async function buildRenewalMessage({ name, dueAt, amountMinor }) {
  const due = new Date(dueAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const amount = (Number(amountMinor || 0) / 100).toFixed(0);
  const fallback =
    `Hi ${name || 'there'}! Your Konkani Samudai annual membership is due on ${due}. ` +
    `Renew for ₹${amount} to keep your member benefits.`;

  const key = process.env.GEMINI_API_KEY || '';
  if (!key) return fallback;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text:
                `Write a short, warm WhatsApp renewal reminder (max 45 words, no markdown) ` +
                `for ${name || 'a member'} whose Konkani Samudai annual membership is due on ${due}. ` +
                `The renewal amount is ₹${amount}. Mention that renewing keeps their member benefits.`,
            }],
          }],
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = await response.json().catch(() => ({}));
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Queue WhatsApp reminders for memberships due within the next 7 days.
 * The outbox check prevents the same member being reminded twice in a year.
 */
export async function queueMembershipRenewalReminders() {
  const client = await pool.connect();
  let queued = 0;
  try {
    const { rows } = await client.query(`
      SELECT m.id, m.name, m.phone, m.amount_minor,
             (COALESCE(m.updated_at, m.created_at) + interval '1 year') AS due_at
      FROM community_members m
      WHERE m.status = 'active'
        AND m.phone IS NOT NULL
        AND btrim(m.phone) <> ''
        AND (COALESCE(m.updated_at, m.created_at) + interval '1 year')
            BETWEEN now() AND now() + interval '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM email_outbox o
          WHERE o.event_type = 'membership_renewal_whatsapp'
            AND o.template_data->>'memberId' = m.id::text
            AND o.created_at > now() - interval '11 months'
        )
      ORDER BY due_at ASC
      LIMIT 20
    `);

    for (const member of rows) {
      const message = await buildRenewalMessage(member);
      await client.query(
        `INSERT INTO email_outbox (event_type, recipient, template_data, status)
         VALUES ('membership_renewal_whatsapp', $1, $2, 'pending')`,
        [
          member.phone,
          JSON.stringify({ memberId: member.id, message }),
        ],
      );
      queued += 1;
    }
  } catch (e) {
    console.error('queueMembershipRenewalReminders error', e);
  } finally {
    client.release();
  }
  return queued;
}

/** Expire orphaned session/checkout rows so they cannot accumulate forever. */
async function cleanupStaleRecords() {
  const released = await pool.query(
    `WITH released AS (
       UPDATE seat_holds SET status='released', released_at=now()
        WHERE status='active' AND owner_user_id IS NULL AND session_ref IS NULL
        RETURNING id
     )
     UPDATE show_seats SET status='available', hold_id=NULL, updated_at=now()
      WHERE hold_id IN (SELECT id FROM released)`,
  );
  const orders = await pool.query(
    `UPDATE community_ticket_orders
        SET status='failed', updated_at=now()
      WHERE (status='creating' AND created_at < now() - interval '10 minutes')
         OR (status='created' AND created_at < now() - interval '24 hours')`,
  );
  const memberships = await pool.query(
    `UPDATE community_membership_orders
        SET status='failed', updated_at=now()
      WHERE status='created' AND created_at < now() - interval '24 hours'`,
  );
  const sessions = await pool.query(
    `UPDATE sessions SET revoked_at=now()
      WHERE revoked_at IS NULL AND expires_at < now()`,
  );
  return {
    releasedHolds: released.rowCount || 0,
    failedOrders: orders.rowCount || 0,
    failedMemberships: memberships.rowCount || 0,
    expiredSessions: sessions.rowCount || 0,
  };
}

/** One maintenance tick: release stale holds, publish movies, flush email. */
export async function runTick() {
  const expired = await expireHolds();
  const cleanup = await cleanupStaleRecords();
  const published = await publishDueMovies();
  const renewals = await queueMembershipRenewalReminders();
  const sent = await processOutbox();
  if (env.YOUPI_ENABLED) {
    try {
      const { cleanupOldObservations } = await import('../payments/youpi/gateway.js');
      const cleaned = await cleanupOldObservations(30);
      if (cleaned > 0) console.log(`[cleanup] removed ${cleaned} old observations`);
    } catch (e) {
      console.error('[cleanup] error', e);
    }
  }
  return { expired, sent, published, renewals, cleanup };
}
