import { Router } from 'express';
import { z } from 'zod';
import * as bookings from './service.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole, optionalAuth } from '../../middleware/auth.js';

const router = Router();

const bookingSchema = z.object({
  holdId: z.string().uuid(),
  contactEmail: z.string().email().optional(),
  contactMobile: z.string().optional(),
  sessionRef: z.string().optional(),
});

router.post('/', optionalAuth, validate(bookingSchema), async (req, res, next) => {
  try {
    const booking = await bookings.createBooking({
      holdId: req.body.holdId,
      userId: req.user?.id,
      sessionRef: req.body.sessionRef,
      contactEmail: req.body.contactEmail,
      contactMobile: req.body.contactMobile,
    });
    res.status(201).json(booking);
  } catch (e) { next(e); }
});

router.get('/me/tickets', requireAuth, async (req, res, next) => {
  try { res.json(await bookings.listMyTickets(req.user.id)); } catch (e) { next(e); }
});

router.get('/:reference', optionalAuth, async (req, res, next) => {
  try { res.json(await bookings.getBooking(req.params.reference, req.user)); } catch (e) { next(e); }
});

// admin
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { pool } = await import('../../db/pool.js');
    const { rows } = await pool.query('SELECT * FROM bookings ORDER BY created_at DESC LIMIT 100');
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/:id/cancel', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try { res.json(await bookings.cancelBooking(req.params.id, req.user.id)); } catch (e) { next(e); }
});

export default router;
