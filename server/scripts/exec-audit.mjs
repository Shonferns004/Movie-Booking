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
walk(path.join(root, 'packages'));
walk(path.join(root, 'apps'));

const re = /=\s*(?:this\.)?(?:ctx\.)?db\.execute\s*\(/g;
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    re.lastIndex = 0;
    if (re.test(line)) {
      console.log(f.replace(root, '') + ':' + (i + 1) + '  ' + line.trim().slice(0, 120));
    }
  });
}
