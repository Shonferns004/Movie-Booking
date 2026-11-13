/**
 * Realtime smoke test.
 *
 * Opens the app-facing WebSocket, creates a throwaway theatre through the API, waits
 * for the `catalog` change event, then deletes the theatre again.
 *
 * Requires: an event producer is running —
 *   - locally:  npm run relay:dev   (or a deployed Node host for production)
 *
 * Usage: npm run test:realtime
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);

const API = (env.REALTIME_RELAY_URL || 'https://movie-worker.konkani-samudai.workers.dev/api/v1/internal/realtime')
  .replace(/\/api\/v1\/internal\/realtime$/, '');
const WS = `${API.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')}/api/v1/realtime`;

const events = [];
const waiters = [];

function waitFor(predicate, ms) {
  const hit = events.find(predicate);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    waiters.push((message) => {
      if (!predicate(message)) return false;
      clearTimeout(timer);
      resolve(message);
      return true;
    });
  });
}

console.log('socket:', WS);
const socket = new WebSocket(WS);
socket.addEventListener('message', (event) => {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }
  events.push(message);
  if (message.type === 'ready') {
    console.log('handshake:', JSON.stringify(message));
  } else if (message.type === 'change') {
    console.log('event:', message.topic);
  }
  for (const waiter of [...waiters]) if (waiter(message)) waiters.splice(waiters.indexOf(waiter), 1);
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve);
  socket.addEventListener('error', () => reject(new Error('could not open the socket')));
});

const ready = await waitFor((m) => m.type === 'ready', 10000);
if (!ready) {
  console.error('FAIL: no handshake within 10s');
  process.exit(1);
}

const name = `Realtime check ${Date.now()}`;
const created = await fetch(`${API}/api/v1/admin/theatres`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-admin-token': env.ADMIN_TOKEN },
  body: JSON.stringify({ name, address: 'realtime check' }),
});
const body = await created.json().catch(() => ({}));
const theatre = body?.theatre;
console.log('created theatre:', created.status, theatre?.id ?? '(none)');

if (created.status !== 201) {
  console.error('FAIL: could not create the test theatre', JSON.stringify(body).slice(0, 200));
  socket.close();
  process.exit(1);
}

const event = await waitFor((m) => m.type === 'change' && m.topic === 'catalog', 45000);

await fetch(`${API}/api/v1/admin/theatres/${theatre.id}`, {
  method: 'DELETE',
  headers: { 'x-admin-token': env.ADMIN_TOKEN },
});
console.log('cleanup: deleted the test theatre');

socket.close();

if (event) {
  console.log('PASS: catalog event received');
  setTimeout(() => process.exit(0), 200);
} else {
  console.error('FAIL: no catalog event within 45s.');
  console.error('  Is an event producer running?  npm run relay:dev  (or the Render relay)');
  console.error('  Check the relay logs for "[realtime] relay subscribed to Neon".');
  setTimeout(() => process.exit(1), 200);
}
