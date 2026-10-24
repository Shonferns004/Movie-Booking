import { createProxy } from '../proxy.js';
import { env } from '../../config/env.js';
import { startYoupiGateway } from './gateway.js';
import { listGatewayServices, serviceNotManaged } from './supervisor.js';

/**
 * Public URL layout of the embedded gateway (all served by the movie API's port):
 *
 *   /youpi/api/*   -> payment core      (stripped to the core's native /api/v1/... paths)
 *   /checkout/*    -> checkout portal    (the hosted UPI checkout page)
 *   /youpi.js      -> checkout portal    (the browser SDK)
 *   /css,/icons,/js-> checkout portal    (assets the checkout page references by absolute path)
 *   /youpi/admin   -> merchant admin     (WhatsApp pairing, APK download, service management)
 *   /youpi/observer-> SMS observer        (reads Google Messages and forwards bank SMS)
 *
 * The admin panel and the observer call their own APIs with absolute paths, so those
 * paths are forwarded as well.
 *
 * The checkout page lives on the API origin, so it renders the SDK's /api/v1 calls
 * through the /youpi prefix (local patch in the vendored portal).
 */
const CORE_PREFIX = '/youpi/api';
const PORTAL_PATHS = ['/checkout', '/youpi.js', '/css/', '/icons/', '/js/'];
const ADMIN_PREFIX = '/youpi/admin';
const OBSERVER_PREFIX = '/youpi/observer';
const GMAIL_PREFIX = '/youpi/gmail';
const ADMIN_API_PATHS = ['/api/admin', '/api/services', '/api/logs/stream'];
const OBSERVER_API_PATHS = ['/api/browser', '/api/sweep', '/process-sms'];

let coreProxy = null;
let portalProxy = null;
let adminProxy = null;
let observerProxy = null;
let gmailProxy = null;

function isCorePath(path) {
  return path === CORE_PREFIX || path.startsWith(`${CORE_PREFIX}/`);
}

function isPortalPath(path) {
  return PORTAL_PATHS.some((prefix) =>
    prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`)
  );
}

function matchesAny(path, prefixes) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
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
  const adminPanel = path === ADMIN_PREFIX || path.startsWith(`${ADMIN_PREFIX}/`);
  const observer = path === OBSERVER_PREFIX || path.startsWith(`${OBSERVER_PREFIX}/`);
  const adminApi = matchesAny(path, ADMIN_API_PATHS);
  const observerApi = matchesAny(path, OBSERVER_API_PATHS);
  const gmail = path === GMAIL_PREFIX || path.startsWith(`${GMAIL_PREFIX}/`);
  const apk = path === '/youpi-sms-gateway.apk';
  const servicesApi = path === '/api/services' || path.startsWith('/api/services/');

  if (!core && !isPortalPath(path) && !adminPanel && !observer && !gmail && !adminApi && !observerApi && !apk && !servicesApi) {
    return next();
  }

  // The upstream control-center supervisor spawns the gateway services as child
  // processes, which would fight with the single-process deployment. Report the real
  // state of the services hosted by this process instead.
  if (servicesApi) {
    if (req.method === 'GET' && path === '/api/services') {
      listGatewayServices({ withPids: !!req.headers.authorization })
        .then((services) => res.json(services))
        .catch(next);
      return;
    }
    const serviceId = path.split('/').filter(Boolean)[2] || 'unknown';
    const embedded = ['payment-api', 'checkout-portal', 'merchant-admin', 'sms-observer'].includes(serviceId);
    res.status(409).json(serviceNotManaged(serviceId, { managed: embedded }));
    return;
  }

  startYoupiGateway()
    .then((gw) => {
      if (!gw) {
        res.status(503).json({ error: 'Payment gateway is disabled' });
        return;
      }
      const remote = gw.remote ? { targetUrl: gw.targetUrl } : {};

      if (core) {
        const upstreamPath = path.slice('/youpi'.length);
        if (isBlockedCorePath(upstreamPath)) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        if (!coreProxy) {
          coreProxy = createProxy({
            target: '127.0.0.1',
            port: gw.corePort,
            ...remote,
            stripPrefix: '/youpi',
          });
        }
        coreProxy(req, res, next);
        return;
      }
      if (isPortalPath(path)) {
        if (!portalProxy) {
          portalProxy = createProxy({ target: '127.0.0.1', port: gw.portalPort, ...remote });
        }
        portalProxy(req, res, next);
        return;
      }
      if ((adminPanel || adminApi || apk) && gw.adminPort) {
        if (!adminProxy) {
          adminProxy = createProxy({ target: '127.0.0.1', port: gw.adminPort, ...remote });
        }
        // The panel itself is served under /youpi/admin, its own API is called by
        // absolute path, so only the panel prefix is stripped.
        if (adminPanel) req.url = req.url.slice(ADMIN_PREFIX.length) || '/';
        adminProxy(req, res, next);
        return;
      }
      if ((observer || observerApi) && gw.observerPort) {
        if (!observerProxy) {
          observerProxy = createProxy({ target: '127.0.0.1', port: gw.observerPort, ...remote });
        }
        if (observer) req.url = req.url.slice(OBSERVER_PREFIX.length) || '/';
        observerProxy(req, res, next);
        return;
      }
      if (gmail && gw.gmailPort) {
        if (!gmailProxy) {
          gmailProxy = createProxy({ target: '127.0.0.1', port: gw.gmailPort, ...remote });
        }
        req.url = req.url.slice(GMAIL_PREFIX.length) || '/';
        gmailProxy(req, res, next);
        return;
      }
      res.status(404).json({ error: 'Not found' });
    })
    .catch(next);
}
