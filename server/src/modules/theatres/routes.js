import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as theatres from './service.js';

const router = Router();

router.get('/categories', async (req, res, next) => {
  try { res.json(await theatres.listCategories()); } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try { res.json(await theatres.listTheatres()); } catch (e) { next(e); }
});

router.get('/:id/auditoriums', async (req, res, next) => {
  try { res.json(await theatres.listAuditoriums(req.params.id)); } catch (e) { next(e); }
});

router.get('/auditoriums/:id/layout', async (req, res, next) => {
  try { res.json(await theatres.getLayout(req.params.id, req.query.version)); } catch (e) { next(e); }
});

export default router;
