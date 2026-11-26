import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { badRequest, unauthorized, conflict } from '../../utils/errors.js';
import { sha256 } from '../../utils/crypto.js';

export async function getUserRoles(userId) {
  const { rows } = await pool.query(
    `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=$1`, [userId]);
  return rows.map((r) => r.name);
}

/** Roles plus the current account lifecycle state, used by every auth check. */
export async function getUserAuthState(userId) {
  const { rows } = await pool.query(
    `SELECT u.status,
            COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id=u.id
       LEFT JOIN roles r ON r.id=ur.role_id
      WHERE u.id=$1
      GROUP BY u.id`,
    [userId],
  );
  if (!rows.length) return null;
  return { status: rows[0].status, roles: rows[0].roles || [] };
}

export async function registerCustomer({ email, password, displayName }) {
  if (!email || !password) throw badRequest('email and password required');
  const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  if (existing.rows.length) throw conflict('email already registered');
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    'INSERT INTO users (email, password_hash, display_name, status) VALUES ($1,$2,$3,$4) RETURNING id,email,display_name',
    [email, hash, displayName || email, 'active']);
  const user = rows[0];
  const role = await pool.query("SELECT id FROM roles WHERE name='CUSTOMER'");
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)', [user.id, role.rows[0].id]);
  return user;
}

export async function login({ email, password }) {
  const { rows } = await pool.query('SELECT id,email,mobile,password_hash,status,display_name FROM users WHERE email=$1', [email]);
  if (!rows.length) throw unauthorized('invalid credentials');
  const user = rows[0];
  if (user.status !== 'active') throw unauthorized('account inactive');
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw unauthorized('invalid credentials');
  const roles = await getUserRoles(user.id);
  return issueSession(user, roles);
}

/** Base URL of the YouPI gateway (embedded locally, Render/Worker in production). */
function gatewayBase() {
  return (env.YOUPI_API_URL || 'http://127.0.0.1:6100').replace(/\/$/, '');
}

async function gatewayPost(path, body) {
  let response;
  try {
    response = await fetch(`${gatewayBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    const error = new Error('Could not reach the WhatsApp OTP service. Please try again.');
    error.status = 503;
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || data.message || 'OTP request failed');
    error.status = response.status || 400;
    throw error;
  }
  return data;
}

const cleanMobile = (value) => String(value || '').replace(/\D/g, '').slice(-10);

/** Sends the login OTP through the same WhatsApp gateway used by checkout. */
export async function sendLoginOtp({ mobile }) {
  const number = cleanMobile(mobile);
  if (!/^\d{10}$/.test(number)) throw badRequest('Enter a valid 10-digit mobile number');

  const data = await gatewayPost('/api/v1/customer/send-otp', { mobileNumber: number });

  // The gateway returns 200 even when its WhatsApp session is offline and the message
  // is only queued. Surface that clearly instead of telling the user "OTP sent".
  if (data?.dispatch && data.dispatch.delivered === false) {
    const error = new Error(
      data.dispatch.message
      || 'WhatsApp is not connected. Link the WhatsApp device in the payments admin, then try again.',
    );
    error.status = 503;
    error.expose = true;
    throw error;
  }

  return {
    success: true,
    mobile: number,
    message: 'OTP sent on WhatsApp',
    // Local development convenience; only an explicit opt-in exposes this.
    devOtp: env.NODE_ENV !== 'production' && env.EXPOSE_DEV_OTP ? data.devOtp : undefined,
  };
}

/** Verifies the WhatsApp OTP and signs the customer into the movie app. */
export async function verifyLoginOtp({ mobile, otp }) {
  const number = cleanMobile(mobile);
  const code = String(otp || '').trim();
  if (!/^\d{10}$/.test(number)) throw badRequest('Enter a valid 10-digit mobile number');
  if (!/^\d{4,8}$/.test(code)) throw badRequest('Enter the OTP from WhatsApp');

  const data = await gatewayPost('/api/v1/customer/verify-otp', { mobileNumber: number, otp: code });

  let user = (await pool.query(
    'SELECT id,email,mobile,display_name,status FROM users WHERE mobile=$1 LIMIT 1',
    [number],
  )).rows[0];

  if (!user) {
    const displayName = data.fullName || `Movie fan ${number.slice(-4)}`;
    user = (await pool.query(
      "INSERT INTO users (mobile, display_name, status) VALUES ($1,$2,'active') RETURNING id,email,mobile,display_name,status",
      [number, displayName],
    )).rows[0];
    const role = await pool.query("SELECT id FROM roles WHERE name='CUSTOMER'");
    if (role.rows.length) {
      await pool.query(
        'INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [user.id, role.rows[0].id],
      );
    }
  }

  if (user.status !== 'active') throw unauthorized('account inactive');
  const roles = await getUserRoles(user.id);
  return {
    ...(await issueSession(user, roles)),
    youpiCustomerToken: data.token,
    mobile: number,
  };
}

function ttlMs(value) {
  const match = /^(\d+)([smhd])$/.exec(String(value || ''));
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return amount * unit;
}

async function issueSession(user, roles, { rotateSessionId = null } = {}) {
  const accessToken = jwt.sign(
    { sub: user.id, roles, type: 'access' },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL }
  );
  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_TTL }
  );
  const tokenHash = sha256(refreshToken);
  const expiresAt = new Date(Date.now() + ttlMs(env.JWT_REFRESH_TTL)).toISOString();
  if (rotateSessionId) {
    await pool.query(
      'UPDATE sessions SET token_hash=$2, expires_at=$3, revoked_at=NULL WHERE id=$1',
      [rotateSessionId, tokenHash, expiresAt],
    );
  } else {
    await pool.query(
      'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
      [user.id, tokenHash, expiresAt],
    );
  }
  return {
    // `token` is kept for older clients; new clients use accessToken/refreshToken.
    token: accessToken,
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, mobile: user.mobile, displayName: user.display_name, roles },
  };
}

export async function refreshSession(refreshToken) {
  if (!refreshToken) throw unauthorized('refresh token required');
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw unauthorized('invalid or expired refresh token');
  }
  if (payload.type !== 'refresh') throw unauthorized('invalid refresh token');
  const { rows: sessions } = await pool.query(
    `SELECT * FROM sessions
      WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()`,
    [sha256(refreshToken)],
  );
  if (!sessions.length) throw unauthorized('session expired');
  if (sessions[0].user_id !== payload.sub) throw unauthorized('session mismatch');
  const { rows } = await pool.query(
    'SELECT id,email,mobile,display_name,status FROM users WHERE id=$1',
    [payload.sub]
  );
  if (!rows.length) throw unauthorized('user not found');
  const user = rows[0];
  if (user.status !== 'active') throw unauthorized('account inactive');
  const roles = await getUserRoles(user.id);
  return issueSession(user, roles, { rotateSessionId: sessions[0].id });
}

/** Revoke one refresh token (logout, or a lost device). */
export async function revokeSession(refreshToken) {
  if (!refreshToken) return { revoked: false };
  await pool.query(
    'UPDATE sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL',
    [sha256(refreshToken)],
  );
  return { revoked: true };
}

export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (payload.type === 'refresh') throw unauthorized('invalid access token');
    return payload;
  } catch (e) {
    if (e?.status === 401) throw e;
    throw unauthorized('invalid token');
  }
}
