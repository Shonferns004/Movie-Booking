import { getYoupiGateway } from './gateway.js';

/**
 * Supervisor for the services that are hosted by this process.
 *
 * Upstream ships a separate control-center app (port 8090) that spawns the gateway
 * services as child processes. In the single-port deployment the same services run
 * inside this process, so that supervisor would try to start duplicates. This module
 * reports the real state of the embedded services instead, in the exact shape the
 * merchant admin panel expects.
 */
const EMBEDDED_SERVICES = [
  { id: 'payment-api', name: 'Payment Core API', key: 'corePort' },
  { id: 'checkout-portal', name: 'Checkout Portal', key: 'portalPort' },
  { id: 'merchant-admin', name: 'Merchant Admin Dashboard', key: 'adminPort' },
  { id: 'sms-observer', name: 'Google Messages / SMS Observer (Legacy)', key: 'observerPort' },
];

const EXTERNAL_SERVICES = [
  { id: 'gmail-observer', name: 'Gmail Payment Observer', port: 6003 },
  // Upstream's demo storefront is not part of this deployment, so it is never
  // probed: something else on this machine may legitimately listen on its port
  // (5000) and its /health would make the panel report the store as RUNNING.
  { id: 'coin-wallet-store', name: 'YOUPI Showcase Store (Demo)', port: 5000, probe: false },
];

async function isHealthy(port) {
  if (!port) return false;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Status of every service, in the panel's expected shape. */
export async function listGatewayServices({ withPids = false } = {}) {
  const gateway = await getYoupiGateway().catch(() => null);
  const uptime = Math.floor(process.uptime());

  const definitions = [
    ...EMBEDDED_SERVICES.map((s) => ({ ...s, port: gateway ? gateway[s.key] : null, embedded: true })),
    ...EXTERNAL_SERVICES.map((s) => ({ ...s, embedded: false })),
  ];

  return Promise.all(
    definitions.map(async (s) => {
      const running = s.probe === false ? false : await isHealthy(s.port);
      return {
        id: s.id,
        name: s.name,
        port: s.port || null,
        status: running ? 'RUNNING' : 'STOPPED',
        pid: running && s.embedded && withPids ? process.pid : null,
        uptimeSeconds: running && s.embedded ? uptime : 0,
        // Embedded services are hosted by this process: the panel must not offer to
        // start or stop them.
        managed: s.embedded,
      };
    })
  );
}

/**
 * The embedded services live in this process - they cannot be started or stopped
 * individually. The panel's start/stop buttons report that instead of failing silently.
 */
export function serviceNotManaged(id, { managed = true } = {}) {
  return {
    error: managed
      ? 'Service is hosted by the API process and cannot be started or stopped separately.'
      : 'Service is not part of this deployment - the gateway runs as a single process.',
    service: id,
    code: managed ? 'MANAGED_BY_HOST' : 'NOT_DEPLOYED',
  };
}
