import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { badRequest, unauthorized, conflict } from '../../utils/errors.js';

export async function getUserRoles(userId) {
  const { rows } = await pool.query(
    `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=$1`, [userId]);
  return rows.map((r) => r.name);
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
  const { rows } = await pool.query('SELECT id,email,password_hash,status,display_name FROM users WHERE email=$1', [email]);
  if (!rows.length) throw unauthorized('invalid credentials');
  const user = rows[0];
  if (user.status !== 'active') throw unauthorized('account inactive');
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw unauthorized('invalid credentials');
  const roles = await getUserRoles(user.id);
  const token = jwt.sign({ sub: user.id, roles }, env.JWT_SECRET, { expiresIn: '7d' });
  return { token, user: { id: user.id, email: user.email, displayName: user.display_name, roles } };
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw unauthorized('invalid token');
  }
}
