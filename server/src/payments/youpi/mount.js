import { createProxy } from '../proxy.js';
import { env } from '../../config/env.js';
import { startYoupiGateway } from './gateway.js';

/**
 * Public URL layout of the embedded gateway (all served by the movie API's port):
 *
 *   /youpi/api/*   -> payment core      (stripped to the core's native /api/v1/... paths)
 *   /checkout/*    -> checkout portal    (the hosted UPI checkout page)
 *   /youpi.js      -> checkout portal    (the browser SDK)
 *   /css,/icons,/js-> checkout portal    (assets the checkout page references by absolute path)
 *
 * The checkout page lives on the API origin, so it renders the SDK's /api/v1 calls
 * through the /youpi prefix (local patch in the vendored portal).
 */
const CORE_PREFIX = '/youpi/api';
const PORTAL_PATHS = ['/checkout', '/youpi.js', '/css/', '/icons/', '/js/'];

let coreProxy = null;
let portalProxy = null;

function isCorePath(path) {
  return path === CORE_PREFIX || path.startsWith(`${CORE_PREFIX}/`);
}

function isPortalPath(path) {
  return PORTAL_PATHS.some((prefix) =>
    prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`)
  );
}

/**
 * The gateway's admin surface and the developer simulators stay off the public
 * port unless they are explicitly enabled.
 */
function isBlockedCorePath(upstreamPath) {
  if (upstreamPath.startsWith('/api/v1/admin/') && !env.YOUPI_ALLOW_ADMIN) return true;
  if (/simulate-observation$/.test(upstreamPath) && !env.YOUPI_ALLOW_DEV_TOOLS) return true;
  return false;
}

export function youpiGatewayMiddleware(req, res, next) {
  const path = req.url.split('?')[0];
  const core = isCorePath(path);
  if (!core && !isPortalPath(path)) return next();

  startYoupiGateway()
    .then((gw) => {
      if (!gw) {
        res.status(503).json({ error: 'Payment gateway is disabled' });
        return;
      }
      if (core) {
        const upstreamPath = path.slice('/youpi'.length);
        if (isBlockedCorePath(upstreamPath)) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        if (!coreProxy) {
          coreProxy = createProxy({ target: '127.0.0.1', port: gw.corePort, stripPrefix: '/youpi' });
        }
        coreProxy(req, res, next);
        return;
      }
      if (!portalProxy) {
        portalProxy = createProxy({ target: '127.0.0.1', port: gw.portalPort });
      }
      portalProxy(req, res, next);
    })
    .catch(next);
}
