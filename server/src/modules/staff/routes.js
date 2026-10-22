import { Router } from 'express';
import { z } from 'zod';
import * as tickets from '../tickets/service.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

const router = Router();

const validateSchema = z.object({
  ticketReference: z.string().min(1),
  showId: z.string().uuid().optional(),
  metadata: z.any().optional(),
});

router.post('/tickets/validate', requireAuth, requireRole('SCANNER', 'SUPERVISOR', 'ADMIN'), validate(validateSchema), async (req, res, next) => {
  try {
    const result = await tickets.validateAndCheckIn({
      ticketReference: req.body.ticketReference,
      showId: req.body.showId,
      staffUserId: req.user.id,
      metadata: req.body.metadata,
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/scan-history', requireAuth, requireRole('SCANNER', 'SUPERVISOR', 'ADMIN'), async (req, res, next) => {
  try { res.json(await tickets.scanHistory(req.user.id)); } catch (e) { next(e); }
});

export default router;
