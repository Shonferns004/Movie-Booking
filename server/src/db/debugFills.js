import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path.resolve(__dirname, '../../../seats_layout.xlsx'));
const ws = wb.getWorksheet('AUDI 1');
for (let r = 8; r <= 9; r++) {
  for (let c = 4; c <= 6; c++) {
    const cell = ws.getCell(r, c);
    console.log(r, c, cell.value, JSON.stringify(cell.fill));
  }
}