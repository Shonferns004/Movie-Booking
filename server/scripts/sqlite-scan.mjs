import fs from 'node:fs';
import path from 'node:path';

const root = 'C:/Users/ADMIN/Desktop/Projects/movie/server/vendor/youpi-pg';
const pats = {
  lastInsertRowid: /lastInsertRowid/g,
  insertOrReplace: /INSERT OR (REPLACE|IGNORE)/gi,
  strftime: /strftime\s*\(/gi,
  datetimeNow: /datetime\s*\(\s*'now'\s*\)/gi,
  groupConcat: /GROUP_CONCAT/gi,
  ifnull: /IFNULL\s*\(/gi,
  jsonExtract: /json_extract/gi,
  pragma: /PRAGMA/gi,
  autoincrement: /AUTOINCREMENT/gi,
  boolEqOne: /=\s*1\b/g,
  julianday: /julianday/gi,
  unixepoch: /unixepoch/gi,
  likeCase: /LIKE\s+'[^%]*'/gi
};

const totals = {};
for (const k of Object.keys(pats)) totals[k] = 0;

function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', '.git', 'data'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) {
      const c = fs.readFileSync(p, 'utf8');
      for (const k of Object.keys(pats)) {
        const m = c.match(pats[k]);
        if (m) {
          totals[k] += m.length;
          console.log(String(m.length).padStart(3), k.padEnd(20), p.replace(root, ''));
        }
      }
    }
  }
}
walk(root);
console.log('---- TOTALS ----');
for (const k of Object.keys(totals)) console.log(String(totals[k]).padStart(4), k);
