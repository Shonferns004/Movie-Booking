import { Router } from 'express';
import { z } from 'zod';
import * as payments from './service.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole, optionalAuth } from '../../middleware/auth.js';

const router = Router();

const orderSchema = z.object({ bookingReference: z.string(), provider: z.string().optional() });
router.post('/orders', optionalAuth, validate(orderSchema), async (req, res, next) => {
  try { res.status(201).json(await payments.createPaymentOrder(req.body)); } catch (e) { next(e); }
});

/* ---- YOUPI PG ---- */

const youpiOrderSchema = z.object({
  bookingReference: z.string(),
  customer: z.object({
    email: z.string().email().optional(),
    mobile: z.string().optional(),
  }).optional(),
});

router.post('/youpi/orders', optionalAuth, validate(youpiOrderSchema), async (req, res, next) => {
  try {
    res.status(201).json(await payments.createYoupiOrder({
      ...req.body,
      publicBase: payments.youpiPublicBase(req),
    }));
  } catch (e) { next(e); }
});

router.get('/youpi/status/:paymentId', async (req, res, next) => {
  try { res.json(await payments.getYoupiStatus(req.params.paymentId)); } catch (e) { next(e); }
});

const youpiConfirmSchema = z.object({
  orderId: z.string(),
  utr: z.string().optional(),
  amountPaise: z.number().int().optional(),
});

router.post('/youpi/confirm', optionalAuth, validate(youpiConfirmSchema), async (req, res, next) => {
  try { res.json(await payments.confirmYoupiPayment(req.body)); } catch (e) { next(e); }
});

// Authoritative YOUPI webhook. MUST be registered before the generic
// /webhooks/:provider route and must use the raw request bytes for HMAC.
router.post('/webhooks/youpi', async (req, res, next) => {
  try {
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const signature = req.headers['x-gateway-signature'];
    const result = await payments.handleYoupiWebhook(raw, signature);
    res.json(result);
  } catch (e) { next(e); }
});

const mockSchema = z.object({ bookingReference: z.string(), success: z.boolean().optional() });
router.post('/mock/complete', validate(mockSchema), async (req, res, next) => {
  try { res.json(await payments.mockCompletePayment(req.body)); } catch (e) { next(e); }
});

router.post('/webhooks/:provider', async (req, res, next) => {
  try {
    const result = await payments.processPaymentEvent({
      provider: req.params.provider,
      providerEventId: req.body.eventId || req.body.id,
      eventType: req.body.eventType || req.body.type || 'payment.unknown',
      payload: req.body.payload || req.body,
    });
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
