import { env } from './config/env.js';
import { pool } from './db/pool.js';
import nodemailer from 'nodemailer';

const transporter = env.EMAIL_PROVIDER === 'smtp' ? nodemailer.createTransport({
  host: env.SMTP_HOST, port: env.SMTP_PORT, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
}) : null;

async function expireHolds() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id FROM seat_holds WHERE status='active' AND expires_at <= now() FOR UPDATE SKIP LOCKED`);
    for (const r of rows) {
      await client.query("UPDATE seat_holds SET status='expired', released_at=now() WHERE id=$1", [r.id]);
      await client.query("UPDATE show_seats SET status='available', hold_id=NULL, updated_at=now() WHERE hold_id=$1", [r.id]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('expireHolds error', e);
  } finally {
    client.release();
  }
}

async function processOutbox() {
  const client = await pool.connect();
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
      } catch (e) {
        const attempts = msg.attempt_count + 1;
        const next = new Date(Date.now() + Math.min(300000, attempts * 30000));
        const status = attempts >= 5 ? 'failed' : 'retry';
        await client.query('UPDATE email_outbox SET status=$1, attempt_count=$2, next_attempt_at=$3, last_error=$4, updated_at=now() WHERE id=$5',
          [status, attempts, next.toISOString(), e.message, msg.id]);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('processOutbox error', e);
  } finally {
    client.release();
  }
}

async function loop() {
  while (true) {
    try {
      await expireHolds();
      await processOutbox();
    } catch (e) { console.error(e); }
    await new Promise((r) => setTimeout(r, env.WORKER_POLL_INTERVAL_MS));
  }
}

loop().catch((e) => { console.error(e); process.exit(1); });
