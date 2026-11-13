/**
 * Runtime detection.
 *
 * The API runs on two hosts: a long-lived Node process (Render, local dev) and
 * Cloudflare Workers. A few things - dotenv reading `.env` from disk, a module level
 * `setInterval` - are safe on Node but not on Workers, so they are gated on this flag.
 */
export const IS_WORKERS =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
