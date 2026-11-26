import { Router } from 'express';
import { z } from 'zod';
import * as bookings from './service.js';
import { cancellationPolicy } from './refund-policy.js';
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

// Public policy text for the website (checkout footer / policy modal).
router.get('/cancel-policy', (req, res) => res.json(cancellationPolicy()));

/* ---- Admin: cancellation requests ---- */

const approveSchema = z.object({
  note: z.string().max(500).optional(),
  refundMinor: z.number().int().nonnegative().optional(),
});
const rejectSchema = z.object({ note: z.string().max(500).optional() });

router.get('/cancellation-requests', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    res.json(await bookings.listCancellationRequests({ status: req.query.status }));
  } catch (e) { next(e); }
});

router.post('/cancellation-requests/:id/approve', requireAuth, requireRole('ADMIN'), validate(approveSchema), async (req, res, next) => {
  try {
    res.json(await bookings.approveCancellationRequest({
      requestId: req.params.id,
      actorId: req.user.id,
      note: req.body.note,
      refundMinor: req.body.refundMinor,
    }));
  } catch (e) { next(e); }
});

router.post('/cancellation-requests/:id/reject', requireAuth, requireRole('ADMIN'), validate(rejectSchema), async (req, res, next) => {
  try {
    res.json(await bookings.rejectCancellationRequest({
      requestId: req.params.id,
      actorId: req.user.id,
      note: req.body.note,
    }));
  } catch (e) { next(e); }
});

/* ---- Admin: refund payout queue ---- */

router.get('/refunds', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try { res.json(await bookings.listRefunds({ status: req.query.status })); } catch (e) { next(e); }
});

const refundUpdateSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  utr: z.string().trim().min(6).max(40).optional(),
  note: z.string().max(500).optional(),
});

router.patch('/refunds/:id', requireAuth, requireRole('ADMIN'), validate(refundUpdateSchema), async (req, res, next) => {
  try {
    res.json(await bookings.updateRefund({
      refundId: req.params.id,
      actorId: req.user.id,
      ...req.body,
    }));
  } catch (e) { next(e); }
});

/* ---- Admin: booking list + manual cancellation ---- */

router.get('/', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { pool } = await import('../../db/pool.js');
    const { rows } = await pool.query(
      `SELECT b.*,
              s.starts_at, m.title,
              (SELECT json_build_object(
                        'id', cr.id, 'status', cr.status, 'reason', cr.reason,
                        'refund_minor', cr.refund_minor, 'policy_percent', cr.policy_percent,
                        'created_at', cr.created_at)
                 FROM booking_cancellation_requests cr
                WHERE cr.booking_id=b.id
                ORDER BY cr.created_at DESC LIMIT 1) AS cancellation,
              (SELECT COALESCE(json_agg(
                        json_build_object(
                          'id', rf.id, 'amount_minor', rf.amount_minor, 'status', rf.status,
                          'utr', rf.utr, 'created_at', rf.created_at)
                        ORDER BY rf.created_at), '[]'::json)
                 FROM refunds rf WHERE rf.booking_id=b.id) AS refunds
         FROM bookings b
         JOIN shows s ON s.id=b.show_id
         JOIN movies m ON m.id=s.movie_id
        ORDER BY b.created_at DESC
        LIMIT 100`);
    res.json(rows);
  } catch (e) { next(e); }
});

const adminCancelSchema = z.object({
  reason: z.string().max(500).optional(),
  refundMode: z.enum(['full', 'policy', 'custom']).optional(),
  refundMinor: z.number().int().nonnegative().optional(),
});

router.post('/admin/:id/cancel', requireAuth, requireRole('ADMIN'), validate(adminCancelSchema), async (req, res, next) => {
  try {
    res.json(await bookings.cancelBooking(req.params.id, req.user.id, req.body));
  } catch (e) { next(e); }
});

/* ---- Customer: cancellation quote + request ---- */

router.get('/:reference/cancel-quote', requireAuth, async (req, res, next) => {
  try {
    res.json(await bookings.getCancellationQuote(req.params.reference, req.user));
  } catch (e) { next(e); }
});

const cancelRequestSchema = z.object({ reason: z.string().max(500).optional() });

router.post('/:reference/cancel', requireAuth, validate(cancelRequestSchema), async (req, res, next) => {
  try {
    res.status(201).json(await bookings.requestCancellation({
      reference: req.params.reference,
      userId: req.user.id,
      reason: req.body.reason,
    }));
  } catch (e) { next(e); }
});

router.get('/:reference', optionalAuth, async (req, res, next) => {
  try { res.json(await bookings.getBooking(req.params.reference, req.user, req.query.token)); } catch (e) { next(e); }
});

export default router;
