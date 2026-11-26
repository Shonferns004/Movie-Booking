import { Router } from 'express';
import { z } from 'zod';
import * as tickets from './service.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole, optionalAuth } from '../../middleware/auth.js';

const router = Router();

router.get('/:id', optionalAuth, async (req, res, next) => {
  try { res.json(await tickets.getTicket(req.params.id, req.user, req.query.token)); } catch (e) { next(e); }
});

const resendSchema = z.object({});
router.post('/:id/resend-email', requireAuth, async (req, res, next) => {
  try { res.json(await tickets.resendEmail(req.params.id, req.user)); } catch (e) { next(e); }
});

// staff validation moved to staff routes but implement here
export default router;
