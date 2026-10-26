import { Router } from 'express';
import { z } from 'zod';
import * as shows from './service.js';
import { validate } from '../../middleware/validate.js';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.js';

const router = Router();

const priceSchema = z.object({ categoryId: z.string().uuid().optional(), seatId: z.string().uuid().optional(), amountMinor: z.number().int().positive(), currency: z.string().optional() });
const showSchema = z.object({
  movieId: z.string().uuid(),
  auditoriumId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  bookingOpensAt: z.string(),
  bookingClosesAt: z.string(),
  status: z.string().optional(),
  prices: z.array(priceSchema).optional(),
  defaultPriceMinor: z.number().int().optional(),
});
const updateShowSchema = z.object({
  movieId: z.string().uuid().optional(),
  auditoriumId: z.string().uuid().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  bookingOpensAt: z.string().optional(),
  bookingClosesAt: z.string().optional(),
  status: z.string().optional(),
  prices: z.array(priceSchema).optional(),
  defaultPriceMinor: z.number().int().positive().optional(),
});

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const includeUnpublished = !!req.user?.roles?.includes('ADMIN');
    res.json(await shows.listShows({
      movieId: req.query.movieId,
      from: req.query.from,
      to: req.query.to,
      includeUnpublished,
    }));
  } catch (e) { next(e); }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const publicOnly = !req.user?.roles?.includes('ADMIN');
    res.json(await shows.getShow(req.params.id, { publicOnly }));
  } catch (e) { next(e); }
});

router.get('/:id/seats', optionalAuth, async (req, res, next) => {
  try {
    const publicOnly = !req.user?.roles?.includes('ADMIN');
    res.json(await shows.getShowSeats(req.params.id, { publicOnly }));
  } catch (e) { next(e); }
});

router.post('/', requireAuth, requireRole('ADMIN'), validate(showSchema), async (req, res, next) => {
  try { res.status(201).json(await shows.createShow(req.body)); } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try { res.json(await shows.deleteShow(req.params.id)); } catch (e) { next(e); }
});

router.patch('/:id', requireAuth, requireRole('ADMIN'), validate(updateShowSchema), async (req, res, next) => {
  try { res.json(await shows.updateShow(req.params.id, req.body)); } catch (e) { next(e); }
});

export default router;
