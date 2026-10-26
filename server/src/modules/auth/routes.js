import { Router } from 'express';
import { z } from 'zod';
import * as auth from './service.js';
import { validate } from '../../middleware/validate.js';

const router = Router();

const registerSchema = z.object({ email: z.string().email(), password: z.string().min(6), displayName: z.string().optional() });
const loginSchema = z.object({ email: z.string().email(), password: z.string() });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const user = await auth.registerCustomer(req.body);
    res.status(201).json({ user });
  } catch (e) { next(e); }
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const result = await auth.login(req.body);
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const result = await auth.refreshSession(req.body.refreshToken);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
