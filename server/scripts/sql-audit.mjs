import fs from 'node:fs';
import path from 'node:path';

const root = 'C:/Users/ADMIN/Desktop/Projects/movie/server/vendor/youpi-pg';
const targets = [
  'packages/db/src/repositories',
  'packages/db/src/database.js',
  'packages/db/src/migrate.js',
  'apps/payment-api/src/routes/pollers.routes.js',
  'apps/checkout-portal/src/server.js',
  'packages/core/src'
];

const risky = [
  { label: 'boolEq1', re: /\bis_active\s*=\s*1\b|\bis_merchant_enabled\s*=\s*1\b|\bis_phone_verified\s*=\s*1\b|\bis_slot_busy\s*=\s*1\b|\bis_successful\s*=\s*1\b|\bis_active\s*=\s*0\b|\bis_successful\s*=\s*0\b/gi },
  { label: 'datetimeNow', re: /datetime\s*\(\s*'now'[^)]*\)/gi },
  { label: 'pragma', re: /PRAGMA[^;'"]*/gi },
  { label: 'insertOr', re: /INSERT OR \w+/gi },
  { label: 'sqliteFn', re: /\b(strftime|group_concat|ifnull|json_extract|julianday|unixepoch|random\(\)|strftime)\s*\(/gi },
  { label: 'limitParam', re: /LIMIT\s+\?/gi },
  { label: 'booleansInInsert', re: /is_active|is_merchant_enabled|is_phone_verified|is_slot_busy|is_successful|is_default|is_open|approved/gi }
];

function walk(d, out) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', '.git', 'data'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
}

const files = [];
for (const t of targets) {
  const p = path.join(root, t);
  if (!fs.existsSync(p)) continue;
  if (fs.statSync(p).isDirectory()) walk(p, files);
  else files.push(p);
}

for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const seen = new Set();
  lines.forEach((line, i) => {
    for (const r of risky) {
      r.re.lastIndex = 0;
      const m = line.match(r.re);
      if (m) {
        const key = r.label + '|' + line.trim();
        if (seen.has(key)) return;
        seen.add(key);
        console.log(`${r.label.padEnd(18)} ${f.replace(root, '')}:${i + 1}`);
        console.log('    ' + line.trim().slice(0, 150));
      }
    }
  });
}
