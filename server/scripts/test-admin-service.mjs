import * as admin from '../src/modules/admin/service.js';
import { pool } from '../src/db/pool.js';

try {
  const theatre = await admin.createTheatre({ name: 'Smoke Test Theatre', address: 'Test Road' });
  console.log('created theatre:', theatre.id);

  const auditorium = await admin.createAuditorium(theatre.id, { name: 'Screen A' });
  console.log('created auditorium:', auditorium.id);

  const grid = [
    [
      { type: 'standard', label: 'A1', row_label: 'A', seat_number: '1' },
      { type: 'premium', label: 'A2', row_label: 'A', seat_number: '2' },
      { type: 'empty' }
    ],
    [
      { type: 'recliner', label: 'B1', row_label: 'B', seat_number: '1' },
      { type: 'wheelchair', label: 'B2', row_label: 'B', seat_number: '2' },
      { type: 'gap' }
    ]
  ];

  const saved = await admin.saveLayout(auditorium.id, { rows: 2, cols: 3, grid });
  console.log('saved layout:', JSON.stringify(saved, null, 2));

  const layout = await admin.getLayout(auditorium.id);
  console.log('reloaded seats:', layout.seats.map((s) => `${s.seat_key}:${s.seat_type}:${s.status}`));

  const listed = await admin.listAuditoriums(theatre.id);
  console.log('auditorium row:', { name: listed[0].name, version: listed[0].active_version, seats: listed[0].seat_count });

  const theatres = await admin.listTheatres();
  console.log('theatre visible:', theatres.some((t) => t.id === theatre.id));

  await admin.deleteTheatre(theatre.id);
  console.log('deleted theatre, remaining auditoriums:', (await pool.query('SELECT count(*)::int c FROM auditoriums WHERE id=$1', [auditorium.id])).rows[0].c);
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
