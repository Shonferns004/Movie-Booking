import { Router } from 'express';
import { z } from 'zod';
import * as inventory from './service.js';
import { validate } from '../../middleware/validate.js';
import { optionalAuth } from '../../middleware/auth.js';

const router = Router();

const holdSchema = z.object({
  showId: z.string().uuid(),
  seatIds: z.array(z.string().uuid()).min(1),
  sessionRef: z.string().optional(),
  guestEmail: z.string().email().optional(),
});

router.post('/', optionalAuth, validate(holdSchema), async (req, res, next) => {
  try {
    const result = await inventory.createHold({
      showId: req.body.showId,
      seatIds: req.body.seatIds,
      userId: req.user?.id,
      sessionRef: req.body.sessionRef,
      guestEmail: req.body.guestEmail,
    });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.delete('/:holdId', optionalAuth, async (req, res, next) => {
  try {
    const result = await inventory.releaseHold({
      holdId: req.params.holdId,
      userId: req.user?.id,
      sessionRef: req.query.sessionRef,
    });
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
