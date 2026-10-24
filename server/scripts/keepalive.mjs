// Pings the deployed service's health endpoint to keep it awake on free tiers.
// Usage: node server/scripts/keepalive.mjs  (set KEEPALIVE_URL env var)
const url = process.env.KEEPALIVE_URL || process.env.APP_URL || 'http://127.0.0.1:4000/health';
try {
  const res = await fetch(url);
  console.log(new Date().toISOString(), url, res.status);
} catch (e) {
  console.error(new Date().toISOString(), url, e.message);
  process.exit(1);
}