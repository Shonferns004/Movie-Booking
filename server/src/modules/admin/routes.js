import { Router } from 'express';
import * as admin from './service.js';
import * as auth from '../auth/service.js';
import { unauthorized } from '../../utils/errors.js';

const router = Router();

/**
 * Optional shared-secret guard for the seat-builder UI.
 * When ADMIN_TOKEN is unset the endpoints stay open (local development).
 */
function adminOnly(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  const supplied = req.headers['x-admin-token'] || req.query.token;
  if (expected && supplied === expected) return next();

  // Allow authenticated admin users (Flutter app uses JWT).
  const header = req.headers.authorization || '';
  const jwt = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (jwt) {
    try {
      const payload = auth.verifyToken(jwt);
      auth.getUserRoles(payload.sub).then((roles) => {
        if (roles.includes('ADMIN')) return next();
        next(unauthorized('Invalid admin token'));
      }).catch(() => next(unauthorized('Invalid admin token')));
      return;
    } catch {
      // fall through
    }
  }

  if (!expected) return next(); // dev mode: open
  next(unauthorized('Invalid admin token'));
}

router.use(adminOnly);

// ---------------------------------------------------------------- theatres

router.get('/theatres', async (req, res, next) => {
  try { res.json({ theatres: await admin.listTheatres() }); } catch (e) { next(e); }
});

router.post('/theatres', async (req, res, next) => {
  try { res.status(201).json({ theatre: await admin.createTheatre(req.body || {}) }); } catch (e) { next(e); }
});

router.patch('/theatres/:id', async (req, res, next) => {
  try { res.json({ theatre: await admin.updateTheatre(req.params.id, req.body || {}) }); } catch (e) { next(e); }
});

router.delete('/theatres/:id', async (req, res, next) => {
  try { res.json(await admin.deleteTheatre(req.params.id)); } catch (e) { next(e); }
});

// ------------------------------------------------------------- auditoriums

router.get('/theatres/:id/auditoriums', async (req, res, next) => {
  try { res.json({ auditoriums: await admin.listAuditoriums(req.params.id) }); } catch (e) { next(e); }
});

router.post('/theatres/:id/auditoriums', async (req, res, next) => {
  try {
    res.status(201).json({ auditorium: await admin.createAuditorium(req.params.id, req.body || {}) });
  } catch (e) { next(e); }
});

router.patch('/auditoriums/:id', async (req, res, next) => {
  try { res.json({ auditorium: await admin.updateAuditorium(req.params.id, req.body || {}) }); } catch (e) { next(e); }
});

router.delete('/auditoriums/:id', async (req, res, next) => {
  try { res.json(await admin.deleteAuditorium(req.params.id)); } catch (e) { next(e); }
});

// ------------------------------------------------------------ seat layouts

router.get('/auditoriums/:id/layout', async (req, res, next) => {
  try { res.json(await admin.getLayout(req.params.id)); } catch (e) { next(e); }
});

router.post('/auditoriums/:id/layout', async (req, res, next) => {
  try { res.status(201).json(await admin.saveLayout(req.params.id, req.body || {})); } catch (e) { next(e); }
});

// --------------------------------------------------------- seat categories

router.get('/seat-categories', async (req, res, next) => {
  try { res.json({ categories: await admin.listCategories() }); } catch (e) { next(e); }
});

router.post('/seat-categories', async (req, res, next) => {
  try { res.status(201).json({ category: await admin.createCategory(req.body || {}) }); } catch (e) { next(e); }
});

export default router;
