import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.resolve(__dirname, '../../../seats_layout.xlsx');

const FILL_CATEGORY = {
  'FFE36C09': 'Prime',
  'FF00B050': 'Recliner',
  'FFFFFF00': 'Prime',
  'FF00B0F0': 'Classic',
  'FFE5B8B7': 'Handicapped',
};

export async function importAllLayouts(client, filePath = DEFAULT_FILE) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  for (const name of ['Prime', 'Classic', 'Recliner', 'Handicapped']) {
    await client.query('INSERT INTO seat_categories (name, description) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING', [name, name]);
  }
  const catRows = await client.query('SELECT id, name FROM seat_categories');
  const catId = Object.fromEntries(catRows.rows.map((r) => [r.name, r.id]));

  let theatreId;
  const t = await client.query('SELECT id FROM theatres WHERE name=$1', ['PVR Sangam']);
  if (t.rows.length) theatreId = t.rows[0].id;
  else {
    const r = await client.query('INSERT INTO theatres (name, address, timezone) VALUES ($1,$2,$3) RETURNING id', ['PVR Sangam', 'Sangam Cinema Road', 'Asia/Kolkata']);
    theatreId = r.rows[0].id;
  }

  for (const ws of wb.worksheets) {
    if (ws.name === 'Sheet1') continue;
    const auditoriumName = ws.name;

    // (merged ranges handled per-cell below)

    let auditoriumId;
    const a = await client.query('SELECT id FROM auditoriums WHERE theatre_id=$1 AND name=$2', [theatreId, auditoriumName]);
    if (a.rows.length) auditoriumId = a.rows[0].id;
    else {
      const r = await client.query('INSERT INTO auditoriums (theatre_id, name) VALUES ($1,$2) RETURNING id', [theatreId, auditoriumName]);
      auditoriumId = r.rows[0].id;
    }

    const vCount = await client.query('SELECT COALESCE(MAX(version),0)::int AS v FROM seat_layout_versions WHERE auditorium_id=$1', [auditoriumId]);
    const nextVersion = vCount.rows[0].v + 1;
    const vr = await client.query(
      `INSERT INTO seat_layout_versions (auditorium_id, version, import_status, approved_at, source_file_name)
       VALUES ($1,$2,'approved',now(),$3) RETURNING id`,
      [auditoriumId, nextVersion, path.basename(filePath)]);
    const versionId = vr.rows[0].id;

    // determine seat columns from row 6 header
    const seatCols = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = ws.getCell(6, c).value;
      if (typeof v === 'number' && !Number.isNaN(v)) seatCols.push(c);
    }

    const rowsToParse = [6, ...Array.from({ length: 15 }, (_, i) => i + 8)];
    for (const r of rowsToParse) {
      const rowLabel = ws.getCell(r, 2).value;
      if (!rowLabel) continue;
      const rowStr = String(rowLabel).trim();
      for (const c of seatCols) {
        const cell = ws.getCell(r, c);
        const val = cell.value;
        if (typeof val !== 'number' || Number.isNaN(val)) continue;
        if (cell.isMerged && cell.address !== cell.master.address) continue;
        const fill = cell.fill && cell.fill.fgColor ? cell.fill.fgColor.argb : null;
        const category = FILL_CATEGORY[fill];
        if (!category) continue;
        let colSpan = 1;
        if (cell.isMerged) {
          let cc = c + 1;
          while (cc <= ws.columnCount) {
            const nextCell = ws.getCell(r, cc);
            if (nextCell.isMerged && nextCell.master && nextCell.master.address === cell.address) {
              colSpan++;
              cc++;
            } else break;
          }
        }
        const seatNumber = Math.trunc(val);
        const seatKey = `${rowStr}${seatNumber}`;
        const accessible = fill === 'FFE5B8B7';
        const fillColor = fill ? `#${fill.slice(2)}` : null;
        await client.query(
          `INSERT INTO seats (auditorium_id, layout_version_id, seat_key, row_label, seat_number, x, y, category_id, seat_type, accessible, col_span, fill_color)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'seat',$9,$10,$11)
           ON CONFLICT (layout_version_id, seat_key) DO NOTHING`,
          [auditoriumId, versionId, seatKey, rowStr, String(seatNumber), c, r, catId[category], accessible, colSpan, fillColor]);
      }
    }

    await client.query('UPDATE auditoriums SET active_layout_version_id=$1 WHERE id=$2', [versionId, auditoriumId]);
  }

  return { imported: wb.worksheets.filter((w) => w.name !== 'Sheet1').length };
}