import ExcelJS from 'exceljs';
const wb = new ExcelJS.Workbook();
console.log('reading...');
await wb.xlsx.readFile('../seats_layout.xlsx');
console.log('done', wb.worksheets.length);
