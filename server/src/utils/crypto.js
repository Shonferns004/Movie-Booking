import crypto from 'node:crypto';

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function randomReference(prefix = 'BK') {
  return `${prefix}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}
