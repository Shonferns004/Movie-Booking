import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path.resolve(__dirname, '../../../seats_layout.xlsx'));
const ws = wb.getWorksheet('AUDI 1');
const mergeMap = new Map();
if (ws.mergedCells && ws.mergedCells.mergedRanges) {
  for (const range of Object.values(ws.mergedCells.mergedRanges)) {
    mergeMap.set(`${range.top}:${range.left}`, range);
    console.log('range', range.top, range.left, range.right, range.bottom);
  }
}
console.log('get 6:4', mergeMap.get('6:4'));
const cell = ws.getCell(6,4);
console.log('cell.isMerged', cell.isMerged, 'master', cell.master?.address);
PY