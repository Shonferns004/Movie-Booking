import { Router } from 'express';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { runTick } from '../../jobs/tick.js';

const router = Router();

/**
 * Maintenance tick for serverless platforms (Vercel Cron, etc).
 *
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`, so the token is
 * compared in constant time. Set CRON_SECRET (or INTERNAL_CRON_SECRET) in the
 * deployment environment - without it the endpoint stays disabled.
 */
function isAuthorised(req) {
  const expected = env.INTERNAL_CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.authorization || '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.get('/tick', async (req, res, next) => {
  if (!isAuthorised(req)) {
    res.status(401).json({ error: 'unauthorised' });
    return;
  }
  try {
    res.json({ ok: true, ...(await runTick()) });
  } catch (e) { next(e); }
});

export default router;
