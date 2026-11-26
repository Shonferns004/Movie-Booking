import * as auth from '../modules/auth/service.js';
import { unauthorized, forbidden } from '../utils/errors.js';

/**
 * Resolve the caller from a Bearer token and re-check the live account state.
 * Roles are re-read per request, and deactivated/deleted accounts are rejected
 * even while an old access token is still cryptographically valid.
 */
async function resolveUser(token) {
  const payload = auth.verifyToken(token);
  const state = await auth.getUserAuthState(payload.sub);
  if (!state || state.status !== 'active') {
    throw unauthorized('account inactive');
  }
  return { id: payload.sub, roles: state.roles };
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());
  resolveUser(token)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(next);
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { req.user = null; return next(); }
  resolveUser(token)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(() => {
      req.user = null;
      next();
    });
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.some((r) => req.user.roles.includes(r))) return next(forbidden());
    next();
  };
}
