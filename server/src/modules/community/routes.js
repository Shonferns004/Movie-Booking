import { Router } from 'express';
import multer from 'multer';

import * as community from './service.js';
import * as payments from '../payments/service.js';
import { getUserRoles, verifyToken } from '../auth/service.js';
import { requireAuth, optionalAuth } from '../../middleware/auth.js';
import { forbidden, unauthorized } from '../../utils/errors.js';
import { isNeonStorageEnabled, uploadObject } from '../../integrations/neon-storage.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

/** Accepts either the shared admin token or a JWT whose user has the ADMIN role. */
function adminOnly(req, res, next) {
  const supplied = req.headers['x-admin-token'];
  const expected = process.env.ADMIN_TOKEN;
  if (expected && supplied === expected) return next();

  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next(unauthorized());

  try {
    const payload = verifyToken(header.slice(7));
    getUserRoles(payload.sub)
      .then((roles) => {
        if (roles.includes('ADMIN')) return next();
        return next(forbidden('Admin role required'));
      })
      .catch(() => next(unauthorized()));
  } catch {
    next(unauthorized());
  }
}

/* ------------------------------------------------------------------ public */

router.get('/', async (req, res, next) => {
  try {
    res.json(await community.getPublicPage());
  } catch (e) {
    next(e);
  }
});

/* -------------------------------------------------------------- membership */

router.get('/membership', requireAuth, async (req, res, next) => {
  try {
    const [member, plan] = await Promise.all([
      community.getMembershipForUser(req.user.id),
      community.getMembershipPlan(),
    ]);
    res.json({ member, plan });
  } catch (e) {
    next(e);
  }
});

router.post('/membership/checkout', requireAuth, async (req, res, next) => {
  try {
    res.status(201).json(
      await community.createMembershipCheckout({
        userId: req.user.id,
        name: req.body?.name,
        phone: req.body?.phone,
        publicBase: payments.youpiPublicBase(req),
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.get('/membership/checkout/:orderId', requireAuth, async (req, res, next) => {
  try {
    res.json(await community.getMembershipCheckout(req.params.orderId, req.user.id));
  } catch (e) {
    next(e);
  }
});

router.post('/membership/checkout/:orderId/confirm', requireAuth, async (req, res, next) => {
  try {
    res.json(
      await community.confirmMembershipCheckout(req.params.orderId, req.user.id, {
        utr: req.body?.utr,
      }),
    );
  } catch (e) {
    next(e);
  }
});

/* ----------------------------------------------------- membership pricing */

router.get('/admin/membership', adminOnly, async (req, res, next) => {
  try {
    res.json({ plan: await community.getMembershipPlan() });
  } catch (e) {
    next(e);
  }
});

router.patch('/admin/membership', adminOnly, async (req, res, next) => {
  try {
    const rupees = Number(req.body?.rupees);
    const amountMinor = Number.isFinite(rupees) && rupees > 0
      ? Math.round(rupees * 100)
      : req.body?.amountMinor;
    res.json({ plan: await community.setMembershipAmount(amountMinor) });
  } catch (e) {
    next(e);
  }
});

/* ---------------------------------------------------------- event tickets */

router.post('/events/:id/checkout', optionalAuth, async (req, res, next) => {
  try {
    res.status(201).json(
      await community.createTicketCheckout({
        eventId: req.params.id,
        tierId: req.body?.tierId,
        quantity: req.body?.quantity,
        name: req.body?.name,
        phone: req.body?.phone,
        userId: req.user?.id,
        publicBase: payments.youpiPublicBase(req),
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.get('/events/checkout/:orderId', async (req, res, next) => {
  try {
    res.json(await community.getTicketCheckout(req.params.orderId));
  } catch (e) {
    next(e);
  }
});

router.post('/events/checkout/:orderId/confirm', async (req, res, next) => {
  try {
    res.json(await community.confirmTicketCheckout(req.params.orderId, { utr: req.body?.utr }));
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------ ticket artwork */

router.get('/admin/event-ticket', adminOnly, async (req, res, next) => {
  try {
    res.json({ settings: await community.getEventTicketSettings() });
  } catch (e) {
    next(e);
  }
});

router.patch('/admin/event-ticket', adminOnly, async (req, res, next) => {
  try {
    res.json({
      settings: await community.setEventTicketBackground(req.body?.backgroundUrl),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/upload', adminOnly, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'send an image file' });
      return;
    }
    if (!isNeonStorageEnabled()) {
      res.status(503).json({ error: 'Image storage is not configured (NEON_STORAGE_*)' });
      return;
    }
    const safeName = String(req.file.originalname || 'image')
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, '-');
    const key = `community/uploads/${Date.now()}-${safeName}`;
    const url = await uploadObject(
      key,
      req.file.buffer,
      req.file.mimetype || 'image/jpeg',
      'public, max-age=31536000',
    );
    res.status(201).json({ url });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------- hero */

router.get('/admin/hero', adminOnly, async (req, res, next) => {
  try {
    res.json({ images: await community.listHero() });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/hero', adminOnly, upload.single('file'), async (req, res, next) => {
  try {
    let url = (req.body?.url || '').trim();

    if (req.file) {
      if (!isNeonStorageEnabled()) {
        res.status(503).json({
          error: 'Image storage is not configured (NEON_STORAGE_*). Send an image URL instead.',
        });
        return;
      }
      const safeName = String(req.file.originalname || 'hero')
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, '-');
      const key = `community/hero/${Date.now()}-${safeName}`;
      url = await uploadObject(key, req.file.buffer, req.file.mimetype || 'image/jpeg', 'public, max-age=31536000');
    }

    if (!url) {
      res.status(400).json({ error: 'send a file or an image url' });
      return;
    }

    const image = await community.addHero({ url, caption: req.body?.caption });
    res.status(201).json({ image });
  } catch (e) {
    next(e);
  }
});

router.delete('/admin/hero/:id', adminOnly, async (req, res, next) => {
  try {
    res.json(await community.deleteHero(req.params.id));
  } catch (e) {
    next(e);
  }
});

/* ----------------------------------------------------------------- events */

router.get('/admin/events', adminOnly, async (req, res, next) => {
  try {
    res.json({ events: await community.listEvents() });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/events', adminOnly, async (req, res, next) => {
  try {
    res.status(201).json({ event: await community.createEvent(req.body || {}) });
  } catch (e) {
    next(e);
  }
});

router.patch('/admin/events/:id', adminOnly, async (req, res, next) => {
  try {
    res.json({ event: await community.updateEvent(req.params.id, req.body || {}) });
  } catch (e) {
    next(e);
  }
});

router.delete('/admin/events/:id', adminOnly, async (req, res, next) => {
  try {
    res.json(await community.deleteEvent(req.params.id));
  } catch (e) {
    next(e);
  }
});

/* ---------------------------------------------------------------- notices */

router.get('/admin/notices', adminOnly, async (req, res, next) => {
  try {
    res.json({ notices: await community.listNotices() });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/notices', adminOnly, async (req, res, next) => {
  try {
    res.status(201).json({ notice: await community.createNotice(req.body || {}) });
  } catch (e) {
    next(e);
  }
});

router.delete('/admin/notices/:id', adminOnly, async (req, res, next) => {
  try {
    res.json(await community.deleteNotice(req.params.id));
  } catch (e) {
    next(e);
  }
});

/* ---------------------------------------------------------------- members */

router.get('/admin/members', adminOnly, async (req, res, next) => {
  try {
    res.json({ members: await community.listMembers() });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/members', adminOnly, async (req, res, next) => {
  try {
    res.status(201).json({ member: await community.createMember(req.body || {}) });
  } catch (e) {
    next(e);
  }
});

router.patch('/admin/members/:id', adminOnly, async (req, res, next) => {
  try {
    res.json({ member: await community.updateMember(req.params.id, req.body || {}) });
  } catch (e) {
    next(e);
  }
});

router.delete('/admin/members/:id', adminOnly, async (req, res, next) => {
  try {
    res.json(await community.deleteMember(req.params.id));
  } catch (e) {
    next(e);
  }
});

export default router;
