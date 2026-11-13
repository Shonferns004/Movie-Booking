#!/usr/bin/env node
/**
 * Pushes every key from `server/.env` to the deployed Worker as a secret.
 *
 * Rules:
 *  - keys already declared in `wrangler.jsonc` `vars` are skipped (vars are repo config,
 *    and the Worker's production values for NODE_ENV / YOUPI_ENABLED must win over the
 *    development ones in .env)
 *  - keys already present as secrets are skipped (values cannot be read back, so
 *    re-pushing would be pointless churn)
 *  - empty values are skipped
 *
 * Usage: npm run secrets:sync  [-- --force]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const workerDir = path.resolve(import.meta.dirname, '..');
const envPath = path.resolve(workerDir, '../.env');
const configPath = path.join(workerDir, 'wrangler.jsonc');
const force = process.argv.includes('--force');

if (!fs.existsSync(envPath)) {
  console.error(`No .env found at ${envPath}`);
  process.exit(1);
}

function parseDotenv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function varsFromConfig(file) {
  const src = fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const block = src.match(/"vars"\s*:\s*\{([\s\S]*?)\n\t\}/);
  if (!block) return new Set();
  return new Set([...block[1].matchAll(/"([A-Z0-9_]+)"\s*:/g)].map((m) => m[1]));
}

function existingSecrets() {
  const res = spawnSync('npx', ['wrangler', 'secret', 'list'], { cwd: workerDir, encoding: 'utf8', shell: true });
  const text = `${res.stdout || ''}${res.stderr || ''}`;
  const start = text.indexOf('[');
  if (start === -1) return new Set();
  try {
    return new Set(JSON.parse(text.slice(start)).map((s) => s.name));
  } catch {
    return new Set();
  }
}

const envVars = parseDotenv(envPath);
const configVars = varsFromConfig(configPath);
const secrets = existingSecrets();

const queue = Object.entries(envVars).filter(
  ([key, value]) => value && !configVars.has(key) && (force || !secrets.has(key)),
);

if (!queue.length) {
  console.log('Nothing to sync — every non-empty .env key is already a var or secret.');
  process.exit(0);
}

const skippedVars = [...configVars].filter((k) => k in envVars);
const skippedSecrets = Object.keys(envVars).filter((k) => secrets.has(k) && !force);
const skippedEmpty = Object.keys(envVars).filter((k) => !envVars[k]);
console.log(`vars (repo config, skipped): ${skippedVars.join(', ') || '-'}`);
console.log(`already secrets: ${skippedSecrets.join(', ') || '-'}`);
console.log(`empty (skipped): ${skippedEmpty.join(', ') || '-'}`);
console.log(`pushing ${queue.length}: ${queue.map(([k]) => k).join(', ')}\n`);

let failed = 0;
for (const [key, value] of queue) {
  const res = spawnSync('npx', ['wrangler', 'secret', 'put', key], {
    cwd: workerDir,
    input: value,
    encoding: 'utf8',
    shell: true,
  });
  const ok = res.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${key}`);
  if (!ok) console.log((res.stderr || res.stdout || '').trim().slice(0, 300));
}

console.log(`\ndone: ${queue.length - failed} pushed, ${failed} failed`);
process.exit(failed ? 1 : 0);
