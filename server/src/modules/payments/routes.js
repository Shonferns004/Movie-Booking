import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import * as payments from './service.js';
import { env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole, optionalAuth } from '../../middleware/auth.js';

const router = Router();

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const orderSchema = z.object({
  bookingReference: z.string(),
  provider: z.enum(['mock', 'youpi']).optional(),
  sessionRef: z.string().min(8).max(128).optional(),
});
router.post('/orders', optionalAuth, validate(orderSchema), async (req, res, next) => {
  try {
    res.status(201).json(await payments.createPaymentOrder({
      ...req.body,
      userId: req.user?.id || null,
    }));
  } catch (e) { next(e); }
});

/* ---- YOUPI PG ---- */

const youpiOrderSchema = z.object({
  bookingReference: z.string(),
  sessionRef: z.string().min(8).max(128).optional(),
  customer: z.object({
    name: z.string().max(120).optional(),
    email: z.string().email().optional(),
    mobile: z.string().max(20).optional(),
  }).optional(),
});

router.post('/youpi/orders', optionalAuth, validate(youpiOrderSchema), async (req, res, next) => {
  try {
    res.status(201).json(await payments.createYoupiOrder({
      ...req.body,
      userId: req.user?.id || null,
      publicBase: payments.youpiPublicBase(req),
    }));
  } catch (e) { next(e); }
});

router.get('/youpi/status/:paymentId', async (req, res, next) => {
  try { res.json(await payments.getYoupiStatus(req.params.paymentId, { publicOnly: true })); } catch (e) { next(e); }
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
  try {
    if (!env.ALLOW_MOCK_PAYMENTS || env.NODE_ENV === 'production' || env.PAYMENT_PROVIDER !== 'mock') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(await payments.mockCompletePayment(req.body));
  } catch (e) { next(e); }
});

router.post('/webhooks/:provider', async (req, res, next) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    if (!env.GENERIC_WEBHOOK_SECRET) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!safeEqual(req.headers['x-webhook-secret'], env.GENERIC_WEBHOOK_SECRET)) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
    if (provider === 'youpi' || !/^[a-z0-9_-]{1,32}$/.test(provider)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const result = await payments.processPaymentEvent({
      provider,
      providerEventId: req.body.eventId || req.body.id,
      eventType: req.body.eventType || req.body.type || 'payment.unknown',
      payload: req.body.payload || req.body,
    });
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
