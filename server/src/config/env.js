import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  API_PORT: Number(process.env.PORT || process.env.API_PORT || 4000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'dev-refresh-secret-change-me',
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL || '7d',
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL || '30d',
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:5173',
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || 'mock',
  // --- Embedded YouPI PG gateway (single-port mode) ---
  YOUPI_ENABLED: process.env.YOUPI_ENABLED !== 'false',
  // Public URL of a gateway that runs somewhere else (split deployment). When set the
  // API proxies to it instead of booting a local one.
  YOUPI_GATEWAY_URL: process.env.YOUPI_GATEWAY_URL || '',
  YOUPI_GATEWAY_API_PORT: Number(process.env.YOUPI_GATEWAY_API_PORT || 6100),
  YOUPI_GATEWAY_PORTAL_PORT: Number(process.env.YOUPI_GATEWAY_PORTAL_PORT || 7000),
  YOUPI_CLIENT_API_BASE: process.env.YOUPI_CLIENT_API_BASE || '/youpi',
  // Merchant admin panel (WhatsApp pairing, APK download) and the local SMS observer.
  YOUPI_ADMIN_ENABLED: process.env.YOUPI_ADMIN_ENABLED !== 'false',
  YOUPI_ADMIN_PORT: Number(process.env.YOUPI_ADMIN_PORT || 6001),
  YOUPI_OBSERVER_ENABLED: process.env.YOUPI_OBSERVER_ENABLED === 'true',
  YOUPI_OBSERVER_PORT: Number(process.env.YOUPI_OBSERVER_PORT || 6002),
  YOUPI_GMAIL_PORT: Number(process.env.YOUPI_GMAIL_PORT || 6003),
  // Google OAuth client for the Gmail observer (create one in Google Cloud Console).
  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID || '',
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET || '',
  GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI || '',
  YOUPI_PUBLIC_BASE_URL: process.env.YOUPI_PUBLIC_BASE_URL || '',
  YOUPI_WEBHOOK_URL: process.env.YOUPI_WEBHOOK_URL || '',
  YOUPI_ALLOW_ADMIN: process.env.YOUPI_ALLOW_ADMIN === 'true',
  YOUPI_ALLOW_DEV_TOOLS: process.env.YOUPI_ALLOW_DEV_TOOLS === 'true',
  YOUPI_FRAME_ANCESTORS: process.env.YOUPI_FRAME_ANCESTORS || '',
  YOUPI_UPI_ID: process.env.YOUPI_UPI_ID || '',
  YOUPI_PAYEE_NAME: process.env.YOUPI_PAYEE_NAME || '',
  // --- Gateway URL for server-to-server calls (through this server's own port) ---
  YOUPI_API_URL: process.env.YOUPI_API_URL || `http://127.0.0.1:${Number(process.env.PORT || process.env.API_PORT || 4000)}/youpi`,
  YOUPI_MERCHANT_ID: process.env.YOUPI_MERCHANT_ID || '00000000-0000-0000-0000-000000000001',
  YOUPI_MERCHANT_KEY: process.env.YOUPI_MERCHANT_KEY || '',
  YOUPI_WEBHOOK_SECRET: process.env.YOUPI_WEBHOOK_SECRET || '',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || 'console',
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM || 'no-reply@movie.local',
  WORKER_POLL_INTERVAL_MS: Number(process.env.WORKER_POLL_INTERVAL_MS || 5000),
  // Secret for the /api/v1/internal/tick endpoint used by Vercel Cron.
  INTERNAL_CRON_SECRET: process.env.INTERNAL_CRON_SECRET || process.env.CRON_SECRET || '',
  HOLD_EXPIRY_SECONDS: Number(process.env.HOLD_EXPIRY_SECONDS || 600),
  MAX_SEATS_PER_BOOKING: Number(process.env.MAX_SEATS_PER_BOOKING || 10),
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
