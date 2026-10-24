import fs from 'node:fs';
import path from 'node:path';

const root = 'C:/Users/ADMIN/Desktop/Projects/movie/server/vendor/youpi-pg';
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', '.git', 'data'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
}
walk(path.join(root, 'packages/db/src/repositories'));
walk(path.join(root, 'packages/core/src'));

const checks = {
  'jsBoolEq1': /\.\w+\s*===?\s*1\b(?!\d)/g,
  'jsBoolNot1': /!\s*==?\s*1\b/g,
  'dateStringOps': /\.(created_at|updated_at|expires_at|completed_at|slot_acquired_at|observed_at|ingested_at|paid_at|last_login_at|otp_expires_at)\s*\.\s*(slice|substring|split|replace|match)/g,
  'toISOString': /\.toISOString\(\)/g,
  'newDateOf': /new Date\((?:row|session|account|customer|merchant|data|s)\w*\.\w+\)/g,
  'amountArith': /amount_?paise\s*[+\-*]|\.amountPaise\s*[+\-*]/gi
};

for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  const lines = c.split('\n');
  lines.forEach((line, i) => {
    for (const k of Object.keys(checks)) {
      checks[k].lastIndex = 0;
      if (checks[k].test(line)) {
        console.log(`${k.padEnd(16)} ${f.replace(root, '')}:${i + 1}`);
        console.log('    ' + line.trim().slice(0, 140));
      }
    }
  });
}
