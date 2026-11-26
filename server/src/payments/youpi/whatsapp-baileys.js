import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import pino from 'pino';
import pg from 'pg';
import makeWASocket, {
  Browsers,
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { gatewayEnv } from '../../config/gateway-env.js';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_AUTH_DIR = path.resolve(__dirname, '../../../vendor/youpi-pg/data/baileys_auth');
const PLATFORM = 'Baileys 6.7.24';

function isPostgresUrl(value) {
  return /^postgres(ql)?:\/\//i.test(String(value || '').trim());
}

function safeSchema(value) {
  const schema = String(value || 'youpi').trim();
  return /^[a-z_][a-z0-9_]*$/i.test(schema) ? schema : 'youpi';
}

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`;
  else if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

function phoneFromJid(jid) {
  if (!jid) return null;
  const digits = String(jid).split('@')[0].split(':')[0];
  return digits ? `+${digits}` : null;
}

/**
 * WhatsApp authentication state stored in Neon (`youpi.wa_auth`).
 *
 * Baileys normally writes creds + signal keys to files; on Render's free plan that
 * disk is wiped on every restart. Persisting the same state in Postgres keeps the
 * linked device alive across deployments without a mounted disk.
 */
async function createPostgresAuthState(connectionString, schemaName) {
  const schema = safeSchema(schemaName);
  const pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 20000,
    idleTimeoutMillis: 30000,
    ssl: /neon\.tech|supabase\.co|amazonaws\.com/.test(connectionString)
      ? { rejectUnauthorized: true }
      : undefined,
  });

  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${schema}.wa_auth (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );

  const read = async (key) => {
    const { rows } = await pool.query(`SELECT value FROM ${schema}.wa_auth WHERE key=$1`, [key]);
    return rows.length ? JSON.parse(rows[0].value, BufferJSON.reviver) : null;
  };

  const write = async (key, value) => {
    if (value === null || value === undefined) {
      await pool.query(`DELETE FROM ${schema}.wa_auth WHERE key=$1`, [key]);
      return;
    }
    await pool.query(
      `INSERT INTO ${schema}.wa_auth (key, value) VALUES ($1,$2)
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
      [key, JSON.stringify(value, BufferJSON.replacer)]
    );
  };

  let creds = await read('__creds__');
  if (!creds) {
    creds = initAuthCreds();
    await write('__creds__', creds);
  }

  const keys = {
    get: async (type, ids) => {
      const out = {};
      const lookup = ids.map((id) => `${type}:${id}`);
      const { rows } = await pool.query(
        `SELECT key, value FROM ${schema}.wa_auth WHERE key = ANY($1::text[])`,
        [lookup]
      );
      const stored = new Map(rows.map((row) => [row.key, JSON.parse(row.value, BufferJSON.reviver)]));
      for (const id of ids) out[id] = stored.get(`${type}:${id}`) ?? null;
      return out;
    },
    set: async (data) => {
      const tasks = [];
      for (const [type, entries] of Object.entries(data || {})) {
        for (const [id, value] of Object.entries(entries || {})) {
          tasks.push(write(`${type}:${id}`, value));
        }
      }
      await Promise.all(tasks);
    },
  };

  return {
    state: { creds, keys },
    saveCreds: () => write('__creds__', creds),
    clear: async () => {
      await pool.query(`DELETE FROM ${schema}.wa_auth`);
      const fresh = initAuthCreds();
      for (const key of Object.keys(creds)) delete creds[key];
      Object.assign(creds, fresh);
      await write('__creds__', creds);
    },
    close: () => pool.end().catch(() => {}),
  };
}

async function createFileAuthState(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  return { state, saveCreds, close: async () => {} };
}

export class BaileysWhatsAppService {
  constructor(options = {}) {
    this.sessionId = options.sessionId || 'youpi_baileys';
    this.status = 'DISCONNECTED';
    this.phoneNumber = null;
    this.lastQr = null;
    this.qrDataUrl = null;
    this.lastError = null;
    this.pairingCode = null;
    this.pairingPhone = null;
    this.sock = null;
    this.authStore = null;
    this.authMode = null;
    this.initPromise = null;
    this.reconnectTimer = null;
    this.manualClose = false;
    this.qrWaiters = [];
    this.client = { lastQr: null };

    // `env` (the movie API config) has no YOUPI_DATABASE_URL: it lives in gatewayEnv.
    // Reading only `env` silently fell back to file auth on Render's ephemeral disk,
    // so every restart lost the linked device.
    this.connectionString = options.connectionString
      || gatewayEnv.YOUPI_DATABASE_URL
      || process.env.YOUPI_DATABASE_URL
      || '';
    this.schemaName = options.schema || process.env.YOUPI_DB_SCHEMA || 'youpi';
    this.authDir = options.authDir || DEFAULT_AUTH_DIR;
  }

  async getAuthStore() {
    if (this.authStore) return this.authStore;
    if (isPostgresUrl(this.connectionString)) {
      this.authStore = await createPostgresAuthState(this.connectionString, this.schemaName);
      this.authMode = 'postgres';
    } else {
      this.authStore = await createFileAuthState(this.authDir);
      this.authMode = 'file';
    }
    return this.authStore;
  }

  async initialize() {
    if (this.status === 'CONNECTED') return { status: this.status };
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.connect().finally(() => { this.initPromise = null; });
    return this.initPromise;
  }

  async connect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.manualClose = false;
    const store = await this.getAuthStore();
    this.status = 'CONNECTING';
    this.lastError = null;

    const sock = makeWASocket({
      auth: store.state,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ubuntu('Chrome'),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
    });

    this.sock = sock;
    sock.ev.on('creds.update', store.saveCreds);
    sock.ev.on('connection.update', (update) => {
      this.handleConnectionUpdate(update).catch((error) => {
        console.warn('[whatsapp:baileys] connection update failed:', error.message);
      });
    });

    return { status: this.status };
  }

  async handleConnectionUpdate(update = {}) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.lastQr = qr;
      this.client.lastQr = qr;
      this.status = 'QR_READY';
      try {
        this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      } catch {
        this.qrDataUrl = null;
      }
      this.resolveQrWaiters({ dataUrl: this.qrDataUrl, raw: qr });
    }

    if (connection === 'open') {
      this.status = 'CONNECTED';
      this.lastQr = null;
      this.qrDataUrl = null;
      this.client.lastQr = null;
      this.lastError = null;
      this.pairingCode = null;
      this.phoneNumber = phoneFromJid(this.sock?.user?.id);
      console.log(`[whatsapp:baileys] connected as ${this.phoneNumber || 'unknown'}`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      this.sock = null;
      this.phoneNumber = null;
      this.status = loggedOut ? 'DISCONNECTED' : 'CONNECTING';
      this.lastError = {
        reason: loggedOut ? 'logged_out' : 'connection_closed',
        statusCode: statusCode ?? null,
        at: new Date().toISOString(),
        message: lastDisconnect?.error?.message
          || (loggedOut ? 'WhatsApp session was logged out' : 'WhatsApp connection closed'),
      };

      if (loggedOut) {
        await this.clearAuth();
        this.status = 'DISCONNECTED';
      } else if (!this.manualClose) {
        this.scheduleReconnect();
      }
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.manualClose) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.initialize().catch((error) => {
        this.lastError = { reason: 'reconnect_failed', at: new Date().toISOString(), message: error.message };
        this.scheduleReconnect();
      });
    }, 5000);
  }

  async reconnect() {
    this.manualClose = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try { await this.sock?.end(undefined); } catch {}
    this.sock = null;
    this.qrDataUrl = null;
    this.lastQr = null;
    this.client.lastQr = null;
    await this.initialize();
    return { status: this.status };
  }

  async disconnect({ cleanSession = false } = {}) {
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      if (cleanSession) await this.sock?.logout();
      else await this.sock?.end(undefined);
    } catch {}

    this.sock = null;
    this.status = 'DISCONNECTED';
    this.phoneNumber = null;
    this.lastQr = null;
    this.qrDataUrl = null;
    this.client.lastQr = null;
    this.pairingCode = null;

    if (cleanSession) await this.clearAuth();
    this.manualClose = false;
  }

  async clearAuth() {
    if (!this.authStore) return;
    if (this.authMode === 'postgres') {
      await this.authStore.clear();
    } else {
      await this.authStore.close?.();
      this.authStore = null;
      try { fs.rmSync(this.authDir, { recursive: true, force: true }); } catch {}
    }
  }

  getStatus() {
    return this.status;
  }

  getClientInfo() {
    return {
      status: this.status,
      phoneNumber: this.phoneNumber,
      platform: PLATFORM,
      sessionId: this.sessionId,
      isConnected: this.status === 'CONNECTED',
      pairingCode: this.pairingCode,
      pairingPhone: this.pairingPhone,
    };
  }

  getQrCode() {
    if (!this.qrDataUrl) return null;
    return { dataUrl: this.qrDataUrl, raw: this.lastQr };
  }

  waitForQrCode(timeoutMs = 8000) {
    if (this.qrDataUrl) {
      return Promise.resolve({ dataUrl: this.qrDataUrl, raw: this.lastQr });
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      this.qrWaiters.push((qr) => {
        clearTimeout(timer);
        resolve(qr);
      });
    });
  }

  resolveQrWaiters(qr) {
    const waiters = this.qrWaiters.splice(0);
    for (const resolve of waiters) resolve(qr);
  }

  async requestPairingCode(phoneNumber) {
    await this.initialize();
    const digits = normalizePhone(phoneNumber);
    if (!digits) throw new Error('A valid phone number is required.');
    if (!this.sock) throw new Error('WhatsApp socket is not ready yet. Try again in a moment.');
    const code = await this.sock.requestPairingCode(digits);
    this.pairingCode = code;
    this.pairingPhone = `+${digits}`;
    return { code, phoneNumber: digits, status: this.status };
  }

  async sendMessage(to, message) {
    if (this.status !== 'CONNECTED' || !this.sock) {
      return {
        success: false,
        delivered: false,
        queued: true,
        status: this.status,
        message: `WhatsApp is not connected (Status: ${this.status}). Please link WhatsApp in Merchant Admin.`,
      };
    }

    const digits = normalizePhone(to);
    if (!digits) {
      return { success: false, delivered: false, status: this.status, message: 'Invalid WhatsApp number.' };
    }
    const jid = `${digits}@s.whatsapp.net`;

    try {
      const result = await this.sock.sendMessage(jid, { text: message });
      return {
        success: true,
        delivered: true,
        id: result?.key?.id || null,
        status: this.status,
        result: { id: result?.key?.id || null, to: jid, text: message },
      };
    } catch (error) {
      this.lastError = { reason: 'send_failed', at: new Date().toISOString(), message: error.message };
      return { success: false, delivered: false, status: this.status, message: error.message };
    }
  }

  async sendDocument(to, buffer, fileName = 'tickets.pdf', caption = '') {
    if (this.status !== 'CONNECTED' || !this.sock) {
      return {
        success: false,
        delivered: false,
        queued: true,
        status: this.status,
        message: `WhatsApp is not connected (Status: ${this.status}). Please link WhatsApp in Merchant Admin.`,
      };
    }

    const digits = normalizePhone(to);
    if (!digits) {
      return { success: false, delivered: false, status: this.status, message: 'Invalid WhatsApp number.' };
    }
    const jid = `${digits}@s.whatsapp.net`;

    try {
      const result = await this.sock.sendMessage(jid, {
        document: buffer,
        mimetype: 'application/pdf',
        fileName,
        caption: caption || fileName,
      });
      return {
        success: true,
        delivered: true,
        id: result?.key?.id || null,
        status: this.status,
        result: { id: result?.key?.id || null, to: jid, fileName },
      };
    } catch (error) {
      this.lastError = { reason: 'send_document_failed', at: new Date().toISOString(), message: error.message };
      return { success: false, delivered: false, status: this.status, message: error.message };
    }
  }

  async sendOtp(to, otpCode, customerName = '') {
    const greeting = customerName ? `Hello *${customerName}*!` : 'Hello!';
    const message =
      `${greeting} Your one time OTP for Konkani Samudai is "*${otpCode}*".\n\n` +
      `Valid for 5 minutes. Do not share this code with anyone.\n\n` +
      `- *Konkani Samudai*`;
    return this.sendMessage(to, message);
  }

  async close() {
    await this.disconnect({ cleanSession: false });
    await this.authStore?.close?.();
  }
}

/**
 * Starts the Baileys service without blocking gateway startup.
 *
 * The auth state lives in Neon, so a cold start can race the database wake-up. Failing
 * at boot must not downgrade the provider (a fallback has no `sendDocument` and cannot
 * deliver tickets), so keep retrying in the background until the socket is up.
 */
export async function createBaileysService(options = {}) {
  const service = new BaileysWhatsAppService(options);
  const start = () => {
    service.initialize().catch((error) => {
      service.lastError = { reason: 'initialize_failed', at: new Date().toISOString(), message: error.message };
      service.status = 'DISCONNECTED';
      console.warn('[whatsapp:baileys] initial connection failed, retrying:', error.message);
      setTimeout(start, 15000);
    });
  };
  start();
  return service;
}

export default BaileysWhatsAppService;
