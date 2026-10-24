/**
 * Synchronous PostgreSQL client for the YOUPI PG database layer.
 *
 * The repositories in this package are written against a synchronous API
 * (SQLite's `node:sqlite` is synchronous). Rather than rewriting every
 * repository, route and engine to `async`, the `pg` pool runs inside a worker
 * thread and this class exposes the exact same synchronous surface:
 *
 *   db.query(sql, params)      -> rows[]
 *   db.queryOne(sql, params)   -> row | null
 *   db.execute(sql, params)    -> { changes, lastInsertRowid }
 *   db.exec(sql)               -> runs a multi-statement script
 *   db.transaction(fn)         -> runs fn inside BEGIN/COMMIT
 *   db.close()                 -> releases the pool
 *
 * The handshake happens through SharedArrayBuffers, so no message passing
 * through the (blocked) main-thread event loop is required.
 */
import { Worker } from 'node:worker_threads';
import v8 from 'node:v8';
import { fileURLToPath } from 'node:url';

const WORKER_PATH = fileURLToPath(new URL('./postgres-worker.js', import.meta.url));

/** 8 MB per direction is plenty for a payment gateway's rows and DDL scripts. */
const BUFFER_SIZE = 8 * 1024 * 1024;

/**
 * Converts SQLite style `?` placeholders to PostgreSQL style `$1, $2, ...`.
 * Question marks inside string literals are left alone.
 * @param {string} sql
 * @returns {string}
 */
export function toPostgresPlaceholders(sql) {
  if (!sql || sql.indexOf('?') === -1) return sql;

  let out = '';
  let index = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      out += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      out += ch;
      continue;
    }
    if (ch === '?' && !inSingle && !inDouble) {
      index += 1;
      out += `$${index}`;
      continue;
    }
    out += ch;
  }
  return out;
}

export class PostgresDatabase {
  /**
   * @param {{ connectionString: string, schema?: string, max?: number, timeoutMs?: number }} options
   */
  constructor(options = {}) {
    const {
      connectionString,
      schema = 'youpi',
      max = 10,
      timeoutMs = 30000
    } = options;

    if (!connectionString) {
      throw new Error('PostgresDatabase requires a connectionString');
    }

    this.dialect = 'postgres';
    this.schema = schema;
    this.timeoutMs = timeoutMs;
    this.closed = false;

    this.flagSab = new SharedArrayBuffer(4);
    this.reqSab = new SharedArrayBuffer(BUFFER_SIZE);
    this.resSab = new SharedArrayBuffer(BUFFER_SIZE);

    this.flag = new Int32Array(this.flagSab);
    this.reqLen = new Int32Array(this.reqSab, 0, 1);
    this.reqBytes = new Uint8Array(this.reqSab, 4);
    this.resLen = new Int32Array(this.resSab, 0, 1);
    this.resBytes = new Uint8Array(this.resSab, 4);

    this.worker = new Worker(WORKER_PATH, {
      workerData: {
        connectionString,
        schema,
        max,
        flagSab: this.flagSab,
        reqSab: this.reqSab,
        resSab: this.resSab
      }
    });
    this.worker.unref();
    this.worker.on('error', (err) => {
      this.lastWorkerError = err;
      console.error('[db:postgres] worker error:', err.message);
    });
  }

  /**
   * Sends one request to the worker and blocks until it answers.
   * @param {object} req
   * @returns {object}
   */
  send(req) {
    if (this.closed) throw new Error('Database is closed');

    const bytes = v8.serialize(req);
    if (bytes.length + 4 > this.reqSab.byteLength) {
      throw new Error(`Database request is too large (${bytes.length} bytes)`);
    }

    this.reqBytes.set(bytes);
    Atomics.store(this.reqLen, 0, bytes.length);

    // Publish the request and wake the worker.
    Atomics.store(this.flag, 0, 1);
    Atomics.notify(this.flag, 0);

    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      const state = Atomics.load(this.flag, 0);
      if (state === 2) break;
      if (state === 3) {
        throw new Error(
          `Postgres worker stopped unexpectedly${this.lastWorkerError ? `: ${this.lastWorkerError.message}` : ''}`
        );
      }
      if (Date.now() > deadline) {
        throw new Error(`Postgres query timed out after ${this.timeoutMs}ms`);
      }
      Atomics.wait(this.flag, 0, state, 5);
    }

    const length = Atomics.load(this.resLen, 0);
    const payload = v8.deserialize(
      Buffer.from(this.resBytes.buffer, this.resBytes.byteOffset, length)
    );

    // Reset to idle for the next request.
    Atomics.store(this.flag, 0, 0);

    if (payload && payload.ok === false) {
      const err = new Error(payload.error || 'Database error');
      if (payload.code) err.code = payload.code;
      if (payload.detail) err.detail = payload.detail;
      throw err;
    }
    return payload;
  }

  /**
   * Executes a statement and returns every row.
   * @param {string} sql
   * @param {any[]} [params=[]]
   * @returns {any[]}
   */
  query(sql, params = []) {
    const res = this.send({ op: 'query', sql: toPostgresPlaceholders(sql), params });
    return res.rows || [];
  }

  /**
   * Executes a statement and returns the first row (or null).
   * @param {string} sql
   * @param {any[]} [params=[]]
   * @returns {any | null}
   */
  queryOne(sql, params = []) {
    const rows = this.query(sql, params);
    return rows.length ? rows[0] : null;
  }

  /**
   * Executes a write statement.
   * @param {string} sql
   * @param {any[]} [params=[]]
   * @returns {{ changes: number, lastInsertRowid: number | null }}
   */
  execute(sql, params = []) {
    const res = this.send({ op: 'query', sql: toPostgresPlaceholders(sql), params });
    return { changes: res.rowCount || 0, lastInsertRowid: null };
  }

  run(sql, params = []) {
    return this.execute(sql, params);
  }

  /**
   * Runs a multi-statement script (DDL and friends).
   * @param {string} sql
   */
  exec(sql) {
    this.send({ op: 'exec', sql });
  }

  /**
   * Runs a callback inside a database transaction.
   * @template T
   * @param {() => T} callback
   * @returns {T}
   */
  transaction(callback) {
    this.send({ op: 'begin' });
    let result;
    try {
      result = callback();
    } catch (err) {
      try {
        this.send({ op: 'rollback' });
      } catch {
        // The connection may already be gone; the original error matters more.
      }
      throw err;
    }
    this.send({ op: 'commit' });
    return result;
  }

  /** Verifies the connection is alive. */
  ping() {
    this.send({ op: 'ping' });
    return true;
  }

  /** Closes the pool and stops the worker. */
  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.worker.postMessage({ type: 'shutdown' });
    } catch {
      // Worker already gone.
    }
    this.worker.terminate();
  }
}
