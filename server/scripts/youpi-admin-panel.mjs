/**
 * Opens the merchant admin panel in headless Chrome, unlocks it with the admin
 * token and reports what the panel actually loads.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9338;
const PANEL = process.env.PANEL_URL || 'http://localhost:4000/youpi/admin';
const TOKEN = fs.readFileSync('vendor/youpi-pg/data/.secrets/admin_api_token', 'utf8').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-admin-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1400,1000', 'about:blank',
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 40 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { /* wait */ }
  if (!target) await sleep(250);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    errors.push(`${m.params.entry.text} ${m.params.entry.url || ''}`);
  }
});
const send = (method, params = {}) => {
  const msgId = ++id;
  return new Promise((res) => { pending.set(msgId, res); ws.send(JSON.stringify({ id: msgId, method, params })); });
};
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url: PANEL });
await sleep(4000);

// seed the token the way the panel stores it after "Unlock", then reload
await evaluate(`(() => { sessionStorage.setItem('youpi_admin_token', ${JSON.stringify(TOKEN)}); return 'seeded'; })()`);
await send('Page.navigate', { url: PANEL });
await sleep(7000);

console.log('=== after unlock ===');
console.log(await evaluate(`JSON.stringify({
  promptVisible: !!document.querySelector('input[type=password]'),
  vpa: ((document.getElementById('accountVpaDisplay')||{}).textContent||'').trim(),
  text: document.body.innerText.replace(/\\s+/g,' ').slice(0,700)
})`));

console.log('\n=== console errors ===');
for (const e of errors.slice(0, 12)) console.log(e);

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(process.env.SHOT_OUT, Buffer.from(shot.result.data, 'base64'));
ws.close();
chrome.kill();
process.exit(0);
