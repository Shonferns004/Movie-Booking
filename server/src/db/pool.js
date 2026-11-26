import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from '../config/env.js';

const { Client, Pool } = pg;

/**
 * Database access for both hosting models.
 *
 * On a Node host this is the usual module level `pg.Pool`, created on first use.
 *
 * On Cloudflare Workers there is no process to hold a pool: Hyperdrive does the
 * pooling, and Cloudflare recommends a `pg` Client per request. Everything in the
 * app talks to `pool.query()` / `pool.connect()`, so instead of rewriting every
 * module this file keeps that API and transparently routes each call to the client
 * bound to the current request (or cron run) with AsyncLocalStorage.
 */
const requestClient = new AsyncLocalStorage();

let hyperdriveConnectionString = null;
let nodePool = null;

/** Called by the Worker entry with `env.HYPERDRIVE.connectionString`. */
export function configureHyperdrive(connectionString) {
  if (connectionString) hyperdriveConnectionString = connectionString;
}

export function usingHyperdrive() {
  return Boolean(hyperdriveConnectionString);
}

/**
 * TLS for managed Postgres (Neon, Supabase) and for any URL that asks for it with
 * `sslmode=`. Those providers present publicly trusted certificates, but turning
 * verification off keeps `require`/`prefer` working the way libpq users expect.
 */
function sslFor(connectionString) {
  if (!connectionString) return undefined;
  const managed = /@[^/]*\b(neon\.tech|supabase\.co)\b/.test(connectionString);
  // Let an explicit sslmode be handled by pg-connection-string (the pinned version
  // verifies the chain and hostname). For managed hosts with no ssl parameter,
  // require verification instead of disabling it.
  if (managed && !/[?&]ssl(mode)?=/.test(connectionString)) {
    return { rejectUnauthorized: true };
  }
  return undefined;
}

function getNodePool() {
  if (!nodePool) {
    nodePool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      // Neon (and other managed Postgres) close idle sockets server-side. Closing them
      // here first avoids a stale client surfacing as ECONNRESET on the next request.
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 60_000,
      keepAlive: true,
      ssl: sslFor(env.DATABASE_URL),
    });
  }
  return nodePool;
}

async function openHyperdriveClient() {
  if (!hyperdriveConnectionString) {
    throw new Error('Hyperdrive is not configured (missing env.HYPERDRIVE binding)');
  }
  const client = new Client({ connectionString: hyperdriveConnectionString });
  await client.connect();
  return client;
}

/** Wraps the request's client so an inner `release()` cannot close it early. */
function boundClient(client) {
  return {
    query: (text, params) => client.query(text, params),
    release: () => {},
  };
}

export const pool = {
  async query(text, params) {
    const bound = requestClient.getStore();
    if (bound) return bound.query(text, params);
    return getNodePool().query(text, params);
  },
  async connect() {
    const bound = requestClient.getStore();
    if (bound) return boundClient(bound);
    return getNodePool().connect();
  },
  async end() {
    if (nodePool) await nodePool.end();
  },
  get totalCount() {
    return nodePool ? nodePool.totalCount : 0;
  },
  get idleCount() {
    return nodePool ? nodePool.idleCount : 0;
  },
};

export async function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Express middleware: opens one Hyperdrive client for the request, runs the rest of
 * the stack inside its async context, and closes the client when the response ends.
 * On a Node host it is a pass-through, since the Pool handles connections.
 */
export function dbMiddleware(req, res, next) {
  // The health check must not depend on the database being reachable.
  if (req.path === '/health') return next();
  if (!hyperdriveConnectionString) return next();

  openHyperdriveClient()
    .then((client) => {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        client.end().catch(() => {});
      };
      res.on('close', close);
      res.on('finish', close);
      requestClient.run(client, () => next());
    })
    .catch(next);
}

/** Runs `fn` with a single Hyperdrive client - used by the cron handler. */
export async function runWithDb(fn) {
  if (!hyperdriveConnectionString) return fn();
  const client = await openHyperdriveClient();
  try {
    return await requestClient.run(client, fn);
  } finally {
    await client.end().catch(() => {});
  }
}
