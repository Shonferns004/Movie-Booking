/**
 * PostgreSQL worker for the YOUPI PG database layer.
 *
 * The repository layer of this package is written against a *synchronous* API
 * (SQLite's `node:sqlite` is synchronous). `pg` is asynchronous, so the pool
 * lives here in a worker thread and the main thread talks to it over a pair of
 * SharedArrayBuffers. This keeps every repository and route call site
 * unchanged while the data lives in PostgreSQL (Supabase, Neon, RDS, ...).
 *
 * Protocol (per request):
 *   flag[0] = 0 idle | 1 request ready | 2 response ready | 3 shutdown
 *   request buffer:  [int32 length][v8-serialized payload]
 *   response buffer: [int32 length][v8-serialized payload]
 */
import { parentPort, workerData } from 'node:worker_threads';
import v8 from 'node:v8';
import pg from 'pg';

const { Pool } = pg;

/**
 * Shape values the way the previous SQLite driver returned them so that the
 * repository mapping code keeps working unchanged.
 *  - int8 / numeric are returned as strings by pg, but SQLite gave numbers.
 *  - timestamps are returned as ISO strings (SQLite stored them that way).
 */
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric
pg.types.setTypeParser(1114, (v) => (v === null ? null : new Date(`${v}Z`).toISOString())); // timestamp
pg.types.setTypeParser(1184, (v) => (v === null ? null : new Date(v).toISOString())); // timestamptz

const {
  connectionString,
  schema,
  max,
  idleTimeoutMillis,
  connectionTimeoutMillis,
  flagSab,
  reqSab,
  resSab
} = workerData || {};

const pool = new Pool({
  connectionString,
  max: max || 10,
  idleTimeoutMillis: idleTimeoutMillis || 30000,
  connectionTimeoutMillis: connectionTimeoutMillis || 15000,
  ssl: /supabase\.co|neon\.tech|amazonaws\.com/.test(connectionString || '')
    ? { rejectUnauthorized: false }
    : undefined,
  // Keep the gateway tables in their own schema so they never collide with the
  // movie booking tables that live in `public`.
  options: schema ? `-c search_path=${schema},public` : undefined
});

pool.on('error', (err) => {
  // A pooled client died (network blip, idle timeout). Log it and let pg replace it.
  console.error('[db:postgres] idle client error:', err.message);
});

/** Client currently bound to an open transaction, if any. */
let txClient = null;

async function runOnClient(sql, params) {
  const client = txClient || pool;
  return client.query(sql, params);
}

async function handle(req) {
  switch (req.op) {
    case 'query': {
      const result = await runOnClient(req.sql, req.params);
      return { ok: true, rows: result.rows, rowCount: result.rowCount };
    }
    case 'exec': {
      // Multi-statement DDL: only valid on the simple query protocol.
      const client = txClient || pool;
      await client.query(req.sql);
      return { ok: true, rows: [], rowCount: 0 };
    }
    case 'begin': {
      if (txClient) throw new Error('A transaction is already open');
      txClient = await pool.connect();
      await txClient.query('BEGIN');
      return { ok: true };
    }
    case 'commit': {
      if (!txClient) throw new Error('No transaction is open');
      const client = txClient;
      txClient = null;
      try {
        await client.query('COMMIT');
      } finally {
        client.release();
      }
      return { ok: true };
    }
    case 'rollback': {
      if (!txClient) return { ok: true };
      const client = txClient;
      txClient = null;
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      return { ok: true };
    }
    case 'ping': {
      await pool.query('SELECT 1');
      return { ok: true };
    }
    case 'close': {
      if (txClient) {
        try {
          await txClient.query('ROLLBACK');
        } catch {}
        txClient.release();
        txClient = null;
      }
      await pool.end();
      return { ok: true, closed: true };
    }
    default:
      throw new Error(`Unknown database op '${req.op}'`);
  }
}

const flag = new Int32Array(flagSab);
const reqLen = new Int32Array(reqSab, 0, 1);
const reqBytes = new Uint8Array(reqSab, 4);
const resLen = new Int32Array(resSab, 0, 1);
const resBytes = new Uint8Array(resSab, 4);

function writeResponse(res) {
  const bytes = v8.serialize(res);
  resBytes.set(bytes);
  Atomics.store(resLen, 0, bytes.length);
  Atomics.store(flag, 0, 2);
  Atomics.notify(flag, 0);
}

async function loop() {
  for (;;) {
    if (loop_stop) return;
    // Wait until the main thread publishes a request.
    let cur = Atomics.load(flag, 0);
    while (cur !== 1) {
      if (cur === 3 || loop_stop) return;
      Atomics.wait(flag, 0, cur, 50);
      cur = Atomics.load(flag, 0);
    }

    const length = Atomics.load(reqLen, 0);
    let req;
    try {
      req = v8.deserialize(Buffer.from(reqBytes.buffer, reqBytes.byteOffset, length));
    } catch (err) {
      writeResponse({ ok: false, error: `Could not decode request: ${err.message}` });
      continue;
    }

    Atomics.store(flag, 0, 0); // acknowledge: request is being processed

    let res;
    try {
      res = await handle(req);
    } catch (err) {
      res = { ok: false, error: err.message, code: err.code, detail: err.detail };
    }

    writeResponse(res);
  }
}

let loop_stop = false;

parentPort.on('message', (msg) => {
  if (msg && msg.type === 'shutdown') {
    loop_stop = true;
    Atomics.store(flag, 0, 3);
    Atomics.notify(flag, 0);
  }
});

loop().catch((err) => {
  console.error('[db:postgres] worker crashed:', err);
  Atomics.store(flag, 0, 3);
  Atomics.notify(flag, 0);
});
