import { pool } from '../db/pool.js';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

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
      `SELECT id FROM seat_holds WHERE status='active' AND expires_at <= now() FOR UPDATE SKIP LOCKED`);
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
        if (transporter) {
          await transporter.sendMail({ from: env.EMAIL_FROM, to: msg.recipient, subject: msg.event_type, text: JSON.stringify(msg.template_data) });
        } else {
          console.log('[email:console]', msg.event_type, msg.recipient, msg.template_data);
        }
        await client.query("UPDATE email_outbox SET status='sent', attempt_count=attempt_count+1, updated_at=now(), provider_message_id=$1 WHERE id=$2",
          [`console-${Date.now()}`, msg.id]);
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

/** One maintenance tick: release stale holds and flush the email outbox. */
export async function runTick() {
  const expired = await expireHolds();
  const sent = await processOutbox();
  return { expired, sent };
}
