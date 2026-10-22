import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  API_PORT: Number(process.env.API_PORT || 4000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:5173',
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || 'mock',
  // --- Embedded YouPI PG gateway (single-port mode) ---
  YOUPI_ENABLED: process.env.YOUPI_ENABLED !== 'false',
  YOUPI_GATEWAY_API_PORT: Number(process.env.YOUPI_GATEWAY_API_PORT || 6100),
  YOUPI_GATEWAY_PORTAL_PORT: Number(process.env.YOUPI_GATEWAY_PORTAL_PORT || 7000),
  YOUPI_CLIENT_API_BASE: process.env.YOUPI_CLIENT_API_BASE || '/youpi',
  YOUPI_PUBLIC_BASE_URL: process.env.YOUPI_PUBLIC_BASE_URL || '',
  YOUPI_WEBHOOK_URL: process.env.YOUPI_WEBHOOK_URL || '',
  YOUPI_ALLOW_ADMIN: process.env.YOUPI_ALLOW_ADMIN === 'true',
  YOUPI_ALLOW_DEV_TOOLS: process.env.YOUPI_ALLOW_DEV_TOOLS === 'true',
  YOUPI_FRAME_ANCESTORS: process.env.YOUPI_FRAME_ANCESTORS || '',
  YOUPI_UPI_ID: process.env.YOUPI_UPI_ID || '',
  YOUPI_PAYEE_NAME: process.env.YOUPI_PAYEE_NAME || '',
  // --- Legacy / standalone gateway URLs ---
  YOUPI_BASE_URL: process.env.YOUPI_BASE_URL || 'http://localhost:7000',
  YOUPI_API_URL: process.env.YOUPI_API_URL || `http://127.0.0.1:${Number(process.env.YOUPI_GATEWAY_API_PORT || 6100)}`,
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
  HOLD_EXPIRY_SECONDS: Number(process.env.HOLD_EXPIRY_SECONDS || 600),
  MAX_SEATS_PER_BOOKING: Number(process.env.MAX_SEATS_PER_BOOKING || 10),
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
