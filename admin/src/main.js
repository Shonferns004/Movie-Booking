/**
 * Theater / auditorium / seat-layout builder.
 *
 * Talks to the root movie API (`/api/v1/admin/...`) which owns the database
 * connection and writes into the canonical booking schema.
 */

const API = '/api/v1/admin';

const SEAT_TYPES = ['standard', 'premium', 'recliner', 'wheelchair', 'gap', 'disabled', 'empty'];

let adminToken = localStorage.getItem('adminToken') || '';
let currentTheatre = null;
let currentAuditorium = null;
let grid = [];
let lastClickedRow = null;
let lastClickedCol = null;
let numberingDirection = 'ltr';
let numberingMode = 'compact';
let useRowLetters = false;
let isPainting = false;
let paintType = null;

// ------------------------------------------------------------------ helpers

const $ = (id) => document.getElementById(id);

function headers() {
  return { 'Content-Type': 'application/json', 'x-admin-token': adminToken };
}

async function api(path, options = {}) {
  const res = await fetch(API + path, { ...options, headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function rowLabel(index) {
  // A..Z, AA..AZ, BA.. for very large grids
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

// -------------------------------------------------------------------- token

$('saveTokenBtn').addEventListener('click', () => {
  adminToken = $('adminToken').value.trim();
  localStorage.setItem('adminToken', adminToken);
  loadTheatres();
});

// ----------------------------------------------------------------- theatres

async function loadTheatres() {
  try {
    const { theatres } = await api('/theatres');
    renderTheatres(theatres || []);
  } catch (e) {
    alert('Could not load theatres: ' + e.message);
  }
}

function renderTheatres(theatres) {
  const list = $('theatreList');
  list.innerHTML = '';

  if (!theatres.length) {
    list.innerHTML = '<p class="hint">No theatres yet. Add one above.</p>';
    return;
  }

  for (const t of theatres) {
    const card = document.createElement('div');
    card.className = 'theater-card';
    card.innerHTML = `
      <div class="info">
        <strong>${escapeHtml(t.name)}</strong><br/>
        <span>${escapeHtml(t.address || 'No address')} · ${t.auditorium_count} auditorium(s)</span>
      </div>
      <div class="actions">
        <button class="btn" data-action="open">Manage screens</button>
        <button class="btn danger" data-action="delete">Delete</button>
      </div>`;
    card.querySelector('[data-action="open"]').addEventListener('click', () => openTheatre(t));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteTheatre(t));
    list.appendChild(card);
  }
}

$('addTheatreBtn').addEventListener('click', async () => {
  const name = $('theatreName').value.trim();
  if (!name) return alert('Theatre name is required');
  try {
    await api('/theatres', {
      method: 'POST',
      body: JSON.stringify({ name, address: $('theatreAddress').value.trim() || null })
    });
    $('theatreName').value = '';
    $('theatreAddress').value = '';
    loadTheatres();
  } catch (e) {
    alert('Could not add theatre: ' + e.message);
  }
});

async function deleteTheatre(theatre) {
  if (!confirm(`Delete "${theatre.name}" and all its auditoriums and layouts?`)) return;
  try {
    await api(`/theatres/${theatre.id}`, { method: 'DELETE' });
    if (currentTheatre?.id === theatre.id) closeBuilder();
    loadTheatres();
  } catch (e) {
    alert('Could not delete theatre: ' + e.message);
  }
}

// -------------------------------------------------------------- auditoriums

async function openTheatre(theatre) {
  currentTheatre = theatre;
  $('auditoriumTitle').textContent = `Auditoriums — ${theatre.name}`;
  $('auditoriumSection').style.display = 'block';
  closeBuilder();
  await loadAuditoriums();
}

async function loadAuditoriums() {
  if (!currentTheatre) return;
  try {
    const { auditoriums } = await api(`/theatres/${currentTheatre.id}/auditoriums`);
    const list = $('auditoriumList');
    list.innerHTML = '';

    if (!auditoriums.length) {
      list.innerHTML = '<p class="hint">No screens yet. Add one above.</p>';
      return;
    }

    for (const a of auditoriums) {
      const card = document.createElement('div');
      card.className = 'theater-card';
      card.innerHTML = `
        <div class="info">
          <strong>${escapeHtml(a.name)}</strong><br/>
          <span>${a.active_version ? `Layout v${a.active_version} · ${a.seat_count} seats` : 'No layout yet'}</span>
        </div>
        <div class="actions">
          <button class="btn primary" data-action="build">Build seats</button>
          <button class="btn danger" data-action="delete">Delete</button>
        </div>`;
      card.querySelector('[data-action="build"]').addEventListener('click', () => openBuilder(a));
      card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteAuditorium(a));
      list.appendChild(card);
    }
  } catch (e) {
    alert('Could not load auditoriums: ' + e.message);
  }
}

$('addAuditoriumBtn').addEventListener('click', async () => {
  if (!currentTheatre) return;
  const name = $('auditoriumName').value.trim();
  if (!name) return alert('Auditorium name is required');
  try {
    await api(`/theatres/${currentTheatre.id}/auditoriums`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    $('auditoriumName').value = '';
    await loadAuditoriums();
  } catch (e) {
    alert('Could not add auditorium: ' + e.message);
  }
});

async function deleteAuditorium(auditorium) {
  if (!confirm(`Delete "${auditorium.name}" and its seat layout?`)) return;
  try {
    await api(`/auditoriums/${auditorium.id}`, { method: 'DELETE' });
    if (currentAuditorium?.id === auditorium.id) closeBuilder();
    await loadAuditoriums();
  } catch (e) {
    alert('Could not delete auditorium: ' + e.message);
  }
}

// ------------------------------------------------------------- seat builder

async function openBuilder(auditorium) {
  currentAuditorium = auditorium;
  $('builderSection').style.display = 'block';
  $('builderTitle').textContent = `Seat Layout — ${auditorium.name}`;
  $('builderHint').textContent = 'Click a seat to cycle its type.';

  try {
    const { version, seats } = await api(`/auditoriums/${auditorium.id}/layout`);
    if (seats && seats.length) {
      grid = gridFromSeats(seats);
      $('rowsInput').value = grid.length;
      $('colsInput').value = grid[0]?.length || 12;
      useRowLetters = grid.some((r) => r.some((c) => c.row_label));
      useRowLetters.checked = useRowLetters;
      $('builderHint').textContent = `Editing layout v${version.version} · ${seats.length} seats`;
    } else {
      grid = [];
      $('rowsInput').value = 10;
      $('colsInput').value = 12;
    }
  } catch (e) {
    alert('Could not load layout: ' + e.message);
    grid = [];
  }

  renderGrid();
  $('builderSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Rebuilds the editable grid from persisted seat rows. */
function gridFromSeats(seats) {
  const maxY = Math.max(...seats.map((s) => s.y));
  const maxX = Math.max(...seats.map((s) => s.x));
  const g = Array.from({ length: maxY + 1 }, () =>
    Array.from({ length: maxX + 1 }, () => ({ type: 'empty', label: '' }))
  );

  for (const seat of seats) {
    g[seat.y][seat.x] = {
      type: seatToType(seat),
      label: seat.seat_key,
      row_label: seat.row_label,
      seat_number: seat.seat_number,
      col_span: seat.col_span || 1,
      merged: false,
      manual: true
    };
  }
  return g;
}

function seatToType(seat) {
  if (seat.seat_type === 'gap') return 'gap';
  if (seat.accessible) return 'wheelchair';
  switch ((seat.category_name || '').toLowerCase()) {
    case 'prime': return 'premium';
    case 'recliner': return 'recliner';
    case 'handicapped': return 'wheelchair';
    case 'classic':
    default: return 'standard';
  }
}

$('buildGridBtn').addEventListener('click', () => {
  const rows = parseInt($('rowsInput').value, 10);
  const cols = parseInt($('colsInput').value, 10);
  if (!rows || !cols) return alert('Rows and columns are required');

  const previous = grid;
  grid = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => {
      const reuse = previous[y]?.[x];
      if (reuse && reuse.type !== 'empty') return { ...reuse, col_span: reuse.col_span || 1, merged: !!reuse.merged, manual: !!reuse.manual };
      return { type: 'standard', label: '', col_span: 1, merged: false, manual: false };
    })
  );
  for (let y = 0; y < grid.length; y++) renumberRow(y);
  renderGrid();
});

function applySeatType(cell, type, x, y) {
  cell.type = type;
  if (!cell.col_span) cell.col_span = 1;
  if (type === 'gap' || type === 'empty') {
    cell.label = '';
    cell.seat_number = '';
    // Gaps should keep seat numbers contiguous by default.
    numberingMode = 'compact';
    if ($('numberingMode')) $('numberingMode').value = 'compact';
  }
  // Renumber the whole row so removed/gap seats don't leave holes
  // in the numbering: 1, (gap), 2, 3 instead of 1, (gap), 3, 4.
  renumberRow(y);
}

function renumberRow(y) {
  if (!grid[y]) return;
  const rl = useRowLetters ? rowLabel(y) : '';
  const cols = grid[y].length;
  const activeIndices = grid[y].map((c, x) => (c.type !== 'gap' && c.type !== 'empty' ? x : -1)).filter((x) => x >= 0);
  const activeCount = activeIndices.length;

  // Precompute compact numbers in the chosen direction.
  const compactMap = new Map();
  if (numberingMode === 'compact') {
    if (numberingDirection === 'ltr') {
      activeIndices.forEach((x, i) => compactMap.set(x, i + 1));
    } else {
      activeIndices.forEach((x, i) => compactMap.set(x, activeCount - i));
    }
  }

  for (let x = 0; x < cols; x++) {
    const cell = grid[y][x];
    if (cell.type === 'gap' || cell.type === 'empty') {
      cell.label = '';
      cell.seat_number = '';
      cell.row_label = cell.row_label || rl;
      continue;
    }
    let num;
    if (numberingMode === 'fixed') {
      num = numberingDirection === 'ltr' ? (x + 1) : (cols - x);
    } else {
      num = compactMap.get(x);
    }
    cell.row_label = rl;
    cell.seat_number = String(num);
    if (!cell.manual) cell.label = `${rl}${num}`;
  }
}

function refreshCell(el, cell) {
  el.className = `seat-cell ${cell.type}`;
  el.textContent = (cell.type === 'gap' || cell.type === 'empty') ? '' : (cell.label || '');
  el.title = cell.label || '';
}

function refreshRow(y) {
  if (!grid[y]) return;
  document.querySelectorAll(`.seat-cell[data-y="${y}"]`).forEach((el) => {
    const x = Number(el.dataset.x);
    refreshCell(el, grid[y][x]);
  });
  const inp = document.querySelector(`.row-label-input[data-row="${y}"]`);
  if (inp) inp.value = grid[y][0]?.row_label || '';
}

function renderRowLabels() {
  const container = $('rowLabels');
  if (!grid.length) { container.innerHTML = ''; return; }
  let html = '<div class="row-labels-title">Row labels (type A, B, C… or leave empty):</div>';
  for (let y = 0; y < grid.length; y++) {
    const rl = grid[y][0]?.row_label || '';
    html += `<div class="row-label-item">
      <span>Row ${y + 1}:</span>
      <input type="text" data-row="${y}" value="${escapeHtml(rl)}" placeholder="e.g. A" />
    </div>`;
  }
  container.innerHTML = html;
  container.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('input', () => {
      const y = Number(inp.dataset.row);
      const val = inp.value.trim();
      for (let x = 0; x < grid[y].length; x++) {
        const cell = grid[y][x];
        if (cell.type === 'gap' || cell.type === 'empty') continue;
        cell.row_label = val;
      }
      // Renumber labels with new row label
      let n = 0;
      const active = grid[y].filter((c) => c.type !== 'gap' && c.type !== 'empty').length;
      let counter = numberingDirection === 'rtl' ? active : 0;
      for (let x = 0; x < grid[y].length; x++) {
        const cell = grid[y][x];
        if (cell.type === 'gap' || cell.type === 'empty') { cell.label = ''; continue; }
        if (numberingDirection === 'rtl') {
          const num = counter;
          counter -= 1;
          cell.seat_number = String(num);
          if (!cell.manual) cell.label = val ? `${val}${num}` : String(num);
        } else {
          counter += 1;
          const num = counter;
          cell.seat_number = String(num);
          if (!cell.manual) cell.label = val ? `${val}${num}` : String(num);
        }
      }
      refreshRow(y);
    });
  });
}

function renderGrid() {
  const container = $('gridContainer');

  if (!grid.length) {
    container.innerHTML = '<p class="hint">Set rows and columns, then click "Build Grid".</p>';
    return;
  }

  const cols = grid[0].length;
  let html = `<div class="seat-grid-rows">`;
  for (let y = 0; y < grid.length; y++) {
    const rl = grid[y][0]?.row_label || '';
    html += `<div class="grid-row">`;
    html += `<input type="text" class="row-label-input" data-row="${y}" value="${escapeHtml(rl)}" placeholder="A" />`;
    html += `<div class="seat-row" style="grid-template-columns: repeat(${cols}, 36px);">`;
    for (let x = 0; x < grid[y].length; x++) {
      const cell = grid[y][x];
      if (cell.merged) continue;
      const text = cell.type === 'gap' || cell.type === 'empty' ? '' : escapeHtml(cell.label || '');
      const span = cell.col_span && cell.col_span > 1 ? ` style="grid-column: span ${cell.col_span};"` : '';
      html += `<div class="seat-cell ${cell.type}" data-x="${x}" data-y="${y}" title="${escapeHtml(cell.label || '')}"${span}>${text}</div>`;
    }
    html += `</div></div>`;
  }
  html += `</div>`;
  container.innerHTML = html;

  container.querySelectorAll('.row-label-input').forEach((inp) => {
    inp.addEventListener('input', () => {
      const y = Number(inp.dataset.row);
      const val = inp.value.trim();
      for (let x = 0; x < grid[y].length; x++) {
        const cell = grid[y][x];
        if (cell.type === 'gap' || cell.type === 'empty') continue;
        cell.row_label = val;
      }
      let counter = numberingDirection === 'rtl' ? grid[y].filter((c) => c.type !== 'gap' && c.type !== 'empty').length : 0;
      for (let x = 0; x < grid[y].length; x++) {
        const cell = grid[y][x];
        if (cell.type === 'gap' || cell.type === 'empty') { cell.label = ''; continue; }
        if (numberingDirection === 'rtl') {
          const num = counter;
          counter -= 1;
          cell.seat_number = String(num);
          if (!cell.manual) cell.label = val ? `${val}${num}` : String(num);
        } else {
          counter += 1;
          const num = counter;
          cell.seat_number = String(num);
          if (!cell.manual) cell.label = val ? `${val}${num}` : String(num);
        }
      }
      refreshRow(y);
    });
  });


  container.querySelectorAll('.seat-cell').forEach((el) => {
    const coords = () => ({ x: Number(el.dataset.x), y: Number(el.dataset.y) });

    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const tool = $('paintTool').value;
      if (tool === 'cycle') return;
      isPainting = true;
      paintType = tool;
      const { x, y } = coords();
      applySeatType(grid[y][x], paintType, x, y);
      lastClickedRow = y;
      lastClickedCol = x;
      refreshRow(y);
    });

    el.addEventListener('mouseenter', () => {
      const tool = $('paintTool').value;
      // Hover-paint works whenever a concrete type is selected (no click needed).
      if (tool === 'cycle') return;
      const { x, y } = coords();
      applySeatType(grid[y][x], tool, x, y);
      lastClickedRow = y;
      lastClickedCol = x;
      refreshRow(y);
    });

    el.addEventListener('click', () => {
      const tool = $('paintTool').value;
      if (tool !== 'cycle') return;
      const { x, y } = coords();
      const cell = grid[y][x];
      const next = SEAT_TYPES[(SEAT_TYPES.indexOf(cell.type) + 1) % SEAT_TYPES.length];
      applySeatType(cell, next, x, y);
      lastClickedRow = y;
      lastClickedCol = x;
      refreshRow(y);
    });

    el.addEventListener('dblclick', () => {
      const x = Number(el.dataset.x);
      const y = Number(el.dataset.y);
      const cell = grid[y][x];
      if (cell.type === 'gap' || cell.type === 'empty') {
        alert('Only seated cells can be renumbered.');
        return;
      }
      const entered = prompt('Seat label (e.g. A12):', cell.label || '');
      if (entered === null) return;
      const label = entered.trim();
      if (!label) return;
      cell.label = label;
      cell.manual = true;
      const m = label.match(/^([A-Za-z]+)(\d+)$/);
      if (m) {
        cell.row_label = m[1].toUpperCase();
        cell.seat_number = m[2];
      }
      refreshRow(y);
    });
  });
}

$('saveLayoutBtn').addEventListener('click', async () => {
  if (!currentAuditorium) return;
  if (!grid.length) return alert('Build a grid first');

  const btn = $('saveLayoutBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const result = await api(`/auditoriums/${currentAuditorium.id}/layout`, {
      method: 'POST',
      body: JSON.stringify({
        rows: grid.length,
        cols: grid[0].length,
        grid
      })
    });
    $('builderHint').textContent =
      `Saved layout v${result.version.version} · ${result.seatCount} seats.`;
    await loadAuditoriums();
  } catch (e) {
    alert('Could not save layout: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Layout';
  }
});

$('fillAllBtn').addEventListener('click', () => {
  if (!grid.length) return alert('Build a grid first');
  const tool = $('paintTool').value;
  if (tool === 'cycle') return alert('Select a seat type in the paint tool first.');
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      applySeatType(grid[y][x], tool, x, y);
    }
  }
  renderGrid();
});

$('insertAisleBtn').addEventListener('click', () => {
  if (!grid.length) return alert('Build a grid first');
  const col = parseInt($('aisleCol').value, 10) - 1;
  if (Number.isNaN(col) || col < 0 || col > grid[0].length) return alert('Invalid column number');
  for (let y = 0; y < grid.length; y++) {
    grid[y].splice(col, 0, { type: 'gap', label: '', manual: false });
  }
  $('colsInput').value = grid[0].length;
  numberingMode = 'compact';
  $('numberingMode').value = 'compact';
  for (let y = 0; y < grid.length; y++) renumberRow(y);
  renderGrid();
});

$('insertAisleRowBtn').addEventListener('click', () => {
  if (!grid.length) return alert('Build a grid first');
  const row = parseInt($('aisleRow').value, 10) - 1;
  if (Number.isNaN(row) || row < 0 || row > grid.length) return alert('Invalid row number');
  const cols = grid[0].length;
  const newRow = Array.from({ length: cols }, () => ({ type: 'gap', label: '', manual: false }));
  grid.splice(row, 0, newRow);
  $('rowsInput').value = grid.length;
  for (let y = 0; y < grid.length; y++) renumberRow(y);
  renderGrid();
});

$('removeAisleBtn').addEventListener('click', () => {
  if (!grid.length) return alert('Build a grid first');
  const col = parseInt($('aisleCol').value, 10) - 1;
  if (Number.isNaN(col) || col < 0 || col >= grid[0].length) return alert('Invalid column number');
  const allGap = grid.every((row) => row[col]?.type === 'gap' || row[col]?.type === 'empty');
  if (!allGap) return alert('That column contains seats, so it is not an aisle.');
  for (let y = 0; y < grid.length; y++) grid[y].splice(col, 1);
  $('colsInput').value = grid[0].length;
  for (let y = 0; y < grid.length; y++) renumberRow(y);
  renderGrid();
});

$('removeAisleRowBtn').addEventListener('click', () => {
  if (!grid.length) return alert('Build a grid first');
  const row = parseInt($('aisleRow').value, 10) - 1;
  if (Number.isNaN(row) || row < 0 || row >= grid.length) return alert('Invalid row number');
  const allGap = grid[row].every((c) => c.type === 'gap' || c.type === 'empty');
  if (!allGap) return alert('That row contains seats, so it is not an aisle.');
  grid.splice(row, 1);
  $('rowsInput').value = grid.length;
  for (let y = 0; y < grid.length; y++) renumberRow(y);
  renderGrid();
});

$('fillRowBtn').addEventListener('click', () => {
  if (!grid.length) return alert('Build a grid first');
  const tool = $('paintTool').value;
  if (tool === 'cycle') return alert('Select a seat type in the paint tool first.');
  if (lastClickedRow === null) return alert('Click a seat first to choose a row.');
  const y = lastClickedRow;
  for (let x = 0; x < grid[y].length; x++) {
    applySeatType(grid[y][x], tool, x, y);
  }
  renderGrid();
});

$('numberingDir').addEventListener('change', (e) => {
  numberingDirection = e.target.value;
  for (let y = 0; y < grid.length; y++) renumberRow(y);
  renderGrid();
});

$('numberingMode').addEventListener('change', (e) => {
  numberingMode = e.target.value;
  for (let y = 0; y < grid.length; y++) renumberRow(y);
  renderGrid();
});

$('useRowLetters').addEventListener('change', (e) => {
  useRowLetters = e.target.checked;
  for (let y = 0; y < grid.length; y++) renumberRow(y);
  renderGrid();
});

$('applyRowLettersBtn').addEventListener('click', () => {
  if (!grid.length) return alert('Build a grid first');
  useRowLetters = true;
  $('useRowLetters').checked = true;
  for (let y = 0; y < grid.length; y++) renumberRow(y);
  renderGrid();
});

function closeBuilder() {
  currentAuditorium = null;
  grid = [];
  lastClickedRow = null;
  $('builderSection').style.display = 'none';
}

$('closeBuilderBtn').addEventListener('click', closeBuilder);

// --------------------------------------------------------------------- init

document.addEventListener('mouseup', () => {
  isPainting = false;
  paintType = null;
});

if (adminToken) $('adminToken').value = adminToken;
loadTheatres();
