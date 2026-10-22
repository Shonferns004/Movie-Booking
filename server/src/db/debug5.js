import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path.resolve(__dirname, '../../../seats_layout.xlsx'));
const ws = wb.getWorksheet('AUDI 1');
console.log('mergedCells type', typeof ws.mergedCells);
console.log('keys', Object.keys(ws.mergedCells || {}));
console.log('mergedRanges type', typeof ws.mergedCells?.mergedRanges);
console.log('mergedRanges', ws.mergedCells?.mergedRanges);
PY