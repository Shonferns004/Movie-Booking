import * as auth from '../modules/auth/service.js';
import { unauthorized, forbidden } from '../utils/errors.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());
  try {
    const payload = auth.verifyToken(token);
    req.user = { id: payload.sub, roles: payload.roles || [] };
    // refresh roles
    auth.getUserRoles(payload.sub).then((roles) => {
      req.user.roles = roles;
      next();
    }).catch(next);
  } catch (e) {
    next(e);
  }
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { req.user = null; return next(); }
  try {
    const payload = auth.verifyToken(token);
    req.user = { id: payload.sub, roles: payload.roles || [] };
    auth.getUserRoles(payload.sub).then((roles) => { req.user.roles = roles; next(); }).catch(() => { req.user = null; next(); });
  } catch {
    req.user = null; next();
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.some((r) => req.user.roles.includes(r))) return next(forbidden());
    next();
  };
}
