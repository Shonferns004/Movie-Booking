import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path.resolve(__dirname, '../../../seats_layout.xlsx'));
const ws = wb.getWorksheet('AUDI 1');
console.log('merged:', ws.mergedCells?.mergedRanges?.map(m => m.toString()) || ws._merges);
for (let c = 4; c <= 24; c++) {
  const cell = ws.getCell(6, c);
  if (cell.value != null) console.log('cell', c, cell.value, 'master?', cell.isMerged, cell.master?.address);
}
PY