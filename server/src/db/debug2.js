import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path.resolve(__dirname, '../../../seats_layout.xlsx'));
const ws = wb.getWorksheet('AUDI 1');
const cell = ws.getCell(15, 27);
console.log('value', cell.value);
console.log('fill', JSON.stringify(cell.fill));
PY