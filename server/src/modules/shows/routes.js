import { Router } from 'express';
import { z } from 'zod';
import * as shows from './service.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

const router = Router();

const priceSchema = z.object({ categoryId: z.string().uuid().optional(), seatId: z.string().uuid().optional(), amountMinor: z.number().int().positive(), currency: z.string().optional() });
const showSchema = z.object({
  movieId: z.string().uuid(),
  auditoriumId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  bookingOpensAt: z.string(),
  bookingClosesAt: z.string(),
  prices: z.array(priceSchema).optional(),
  defaultPriceMinor: z.number().int().optional(),
});

router.get('/', async (req, res, next) => {
  try { res.json(await shows.listShows({ movieId: req.query.movieId, from: req.query.from, to: req.query.to })); } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try { res.json(await shows.getShow(req.params.id)); } catch (e) { next(e); }
});

router.get('/:id/seats', async (req, res, next) => {
  try { res.json(await shows.getShowSeats(req.params.id)); } catch (e) { next(e); }
});

router.post('/', requireAuth, requireRole('ADMIN'), validate(showSchema), async (req, res, next) => {
  try { res.status(201).json(await shows.createShow(req.body)); } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try { res.json(await shows.deleteShow(req.params.id)); } catch (e) { next(e); }
});

router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try { res.json(await shows.updateShow(req.params.id, req.body)); } catch (e) { next(e); }
});

export default router;
