import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api.js';
import { useRealtime } from '../services/realtime.js';

const C = {
  ink: '#131315',
  tide: '#1B1B1D',
  shell: '#E5E1E4',
  kokum: '#F5C542',
  mango: '#F5C542',
  green: '#BBCBB6',
  sold: '#A9A29E',
};

const MAX_SEATS = 10;
const ZOOM_STEPS = [0.8, 0.9, 1, 1.15, 1.3];

const rupees = (minor = 0) => `₹${Math.round(Number(minor || 0) / 100).toLocaleString('en-IN')}`;

function longDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function timeLabel(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const STYLES = `
.kk-seat-body { font-family: 'Public Sans', system-ui, sans-serif; }
.kk-display { font-family: 'Fraunces', Georgia, serif; }

.kk-seat {
  display: flex; align-items: center; justify-content: center;
  height: var(--kk-seat); border-radius: 4px; border: 1px solid transparent;
  font-size: 9px; font-weight: 700; line-height: 1;
  transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
}
.kk-seat:not(:disabled) { cursor: pointer; }
.kk-seat:not(:disabled):hover { transform: translateY(-1px) scale(1.07); z-index: 1; }
.kk-seat:disabled { cursor: not-allowed; }
.kk-seat-row { display: grid; grid-template-columns: repeat(var(--kk-cols), var(--kk-seat)); gap: 4px; --kk-seat: 18px; }
.kk-cat-line { height: 1px; flex: 1 1 0%; background: rgba(229, 225, 228,.14); }

.kk-pay { transition: background-color .2s ease, transform .2s ease, opacity .2s ease; }
.kk-pay:not(:disabled):hover { background-color: #C49517; transform: translateY(-1px); }

.kk-pill { transition: background-color .16s ease, color .16s ease, transform .16s ease; }
.kk-pill:not(:disabled):hover { transform: translateY(-1px); }

.kk-zoom { transition: background-color .16s ease, color .16s ease; }
.kk-zoom:not(:disabled):hover { background-color: rgba(229, 225, 228,.12); }

.kk-toast { animation: kk-toast-in .22s ease both; }
@keyframes kk-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

@media (min-width: 640px) { .kk-seat-row { --kk-seat: 22px; } }
@media (prefers-reduced-motion: reduce) {
  .kk-seat, .kk-pay, .kk-pill, .kk-zoom { transition: none !important; }
  .kk-toast { animation: none !important; }
}
`;

function Legend({ color, label, filled = false }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i
        className="inline-block h-3 w-3 rounded-[3px] border"
        style={{
          borderColor: color,
          background: filled ? color : 'transparent',
        }}
      />
      {label}
    </span>
  );
}

export default function SeatSelection() {
  const { showId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [movie, setMovie] = useState(null);
  const [showMeta, setShowMeta] = useState(null);
  const [selected, setSelected] = useState([]);
  const [limit, setLimit] = useState(2);
  const [draft, setDraft] = useState(2);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [notice, setNotice] = useState('');
  const [loadingError, setLoadingError] = useState('');
  const [holding, setHolding] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(2);

  async function load() {
    setLoadingError('');
    try {
      const r = await api.get(`/shows/${showId}/seats`);
      setData(r.data);
      if (r.data.show) {
        try {
          const movieId = r.data.show.movie_id || r.data.show.movieId;
          if (movieId) {
            const m = await api.get(`/movies/${movieId}`);
            setMovie(m.data);
          }
        } catch (e) {
          // Seat selection stays usable without the movie poster.
        }
      }
    } catch (e) {
      setLoadingError(e?.response?.data?.error || e.message || 'Could not load seats.');
    }
  }

  useEffect(() => { load(); }, [showId]);

  // Seats are the most volatile data: someone else holding/booking a seat shows up
  // here without a refresh.
  useRealtime(['seats'], () => { load(); });

  const seats = data?.seats || [];
  const show = data?.show || {};

  // The show payload only carries the auditorium id, so pull the theatre name from
  // the public show list. Failure is harmless: the header falls back to "Cinema".
  useEffect(() => {
    const movieId = show.movie_id || show.movieId;
    if (!movieId) return undefined;
    let active = true;
    api.get('/shows', { params: { movieId } })
      .then((r) => {
        const match = (r.data || []).find((s) => s.id === showId || s.id === show.id);
        if (active && match) setShowMeta(match);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [show.movie_id, show.movieId, show.id, showId]);

  const layout = useMemo(() => {
    if (!seats.length) return { sections: [], minX: 0, cols: 0, available: 0 };

    const xs = seats.map((s) => Number(s.x)).filter(Number.isFinite);
    const minX = xs.length ? Math.min(...xs) : 0;
    // A merged seat (col_span) reaches past its own column, so measure its right edge.
    const rightEdges = seats
      .map((s) => Number(s.x) + Math.max(1, Number(s.col_span) || 1) - 1)
      .filter(Number.isFinite);
    const maxX = rightEdges.length ? Math.max(...rightEdges) : 0;

    const grouped = new Map();
    for (const seat of seats) {
      const name = seat.category_name || 'Standard';
      if (!grouped.has(name)) grouped.set(name, { name, price: 0, seats: [] });
      const cat = grouped.get(name);
      cat.seats.push(seat);
      cat.price = Math.max(cat.price, Number(seat.price_minor) || 0);
    }

    const sections = [...grouped.values()].map((cat) => {
      const rows = new Map();
      for (const seat of cat.seats) {
        const label = seat.row_label || '•';
        if (!rows.has(label)) rows.set(label, { label, y: Number(seat.y), seats: [] });
        rows.get(label).seats.push(seat);
      }
      const rowList = [...rows.values()].map((row) => ({
        ...row,
        seats: [...row.seats].sort((a, b) => Number(a.x) - Number(b.x)),
      }));
      const hasY = rowList.some((row) => Number.isFinite(row.y) && row.y !== 0);
      rowList.sort((a, b) => (hasY ? (a.y - b.y) || a.label.localeCompare(b.label) : b.label.localeCompare(a.label)));
      const rowYs = rowList.map((row) => row.y).filter(Number.isFinite);
      const minY = rowYs.length ? Math.min(...rowYs) : null;
      return { ...cat, rows: rowList, minY };
    });

    // Printed-plan order: back of the hall first when the layout has coordinates,
    // otherwise the priciest tier first.
    sections.sort((a, b) => {
      if (a.minY !== null && b.minY !== null && a.minY !== b.minY) return a.minY - b.minY;
      return b.price - a.price;
    });

    return {
      sections,
      minX,
      cols: maxX - minX + 1,
      available: seats.filter((s) => s.status === 'available').length,
    };
  }, [seats]);

  const { sections, minX, cols } = layout;
  const availableCount = layout.available;

  const stats = useMemo(() => sections.map((section) => {
    const total = section.seats.length;
    const available = section.seats.filter((s) => s.status === 'available').length;
    const occupancy = total ? (total - available) / total : 0;
    const status = available === 0 ? 'FILLED' : occupancy >= 0.65 ? 'ALMOST FULL' : 'AVAILABLE';
    return { name: section.name, price: section.price, total, available, occupancy, status };
  }), [sections]);

  const bestsellerName = useMemo(() => {
    if (!stats.length) return null;
    const top = stats.reduce((a, b) => (b.occupancy > a.occupancy ? b : a));
    return top.occupancy >= 0.3 ? top.name : null;
  }, [stats]);

  const maxSelectable = Math.max(1, Math.min(MAX_SEATS, availableCount));

  const selectedSeats = useMemo(
    () => seats.filter((seat) => selected.includes(seat.seat_id)),
    [seats, selected]
  );
  const totalMinor = selectedSeats.reduce((sum, seat) => sum + (Number(seat.price_minor) || 0), 0);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') setPickerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  function toggle(seat) {
    const isSelected = selected.includes(seat.seat_id);
    if (seat.status !== 'available' && !isSelected) return;

    if (isSelected) {
      setSelected((current) => current.filter((id) => id !== seat.seat_id));
      return;
    }
    if (selected.length >= limit) {
      setNotice(`You can pick up to ${limit} seat${limit === 1 ? '' : 's'} on this booking.`);
      return;
    }
    setSelected((current) => [...current, seat.seat_id]);
  }

  async function hold() {
    if (!selected.length || holding) return;
    setHolding(true);
    try {
      let sessionRef = localStorage.getItem('sessionRef');
      if (!sessionRef) {
        sessionRef = crypto.randomUUID();
        localStorage.setItem('sessionRef', sessionRef);
      }
      const r = await api.post('/seat-holds', {
        showId,
        seatIds: selected,
        sessionRef,
      });
      const holdData = { ...r.data, holdId: r.data.holdId || r.data.id, showId };
      localStorage.setItem('currentHold', JSON.stringify(holdData));
      localStorage.setItem('currentHoldContext', JSON.stringify({
        holdId: holdData.holdId,
        title,
        theatre: showMeta?.theatre_name || '',
        auditorium: showMeta?.auditorium_name || '',
        startsAt: show.starts_at || '',
        language: movie?.language || '',
        certification: movie?.certification || '',
        seats: selectedSeats.map((seat) => ({
          row_label: seat.row_label,
          seat_number: seat.seat_number,
          category_name: seat.category_name,
          price_minor: seat.price_minor,
        })),
      }));
      navigate('/checkout', { state: holdData });
    } catch (e) {
      setNotice(e?.response?.data?.error || e.message || 'Could not hold those seats.');
    } finally {
      setHolding(false);
    }
  }

  function confirmCount() {
    const next = Math.max(1, Math.min(draft, maxSelectable));
    setDraft(next);
    setLimit(next);
    setPickerOpen(false);
  }

  const title = movie?.title || showMeta?.movie_title || 'Movie screening';
  const locality = showMeta?.theatre_name
    ? `${showMeta.theatre_name}${showMeta.auditorium_name ? ` : ${showMeta.auditorium_name}` : ''}`
    : (showMeta?.auditorium_name || 'Cinema');
  const dateText = show.starts_at ? longDate(show.starts_at) : '';
  const timeText = show.starts_at ? timeLabel(show.starts_at) : '';

  if (!data) {
    return (
      <div className="kk-seat-body flex min-h-screen items-center justify-center bg-[#131315] px-5 text-center text-[#E5E1E4]">
        <style>{STYLES}</style>
        <div className="max-w-sm">
          <div
            className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-dashed"
            style={{ borderColor: C.mango, borderTopColor: 'transparent' }}
          />
          <h1 className="kk-display text-2xl font-bold">Preparing your seat map</h1>
          <p className="mt-2 text-sm text-[#E5E1E4]/65">
            {loadingError || 'Finding the best seats for your screening…'}
          </p>
          {loadingError && (
            <button type="button" onClick={load} className="mt-5 rounded-xl px-5 py-2.5 font-semibold text-[#131315]" style={{ background: C.kokum }}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="kk-seat-body min-h-screen bg-[#131315] pb-40 text-[#E5E1E4]">
      <style>{STYLES}</style>

      {/* Show bar */}
      <div className="sticky top-[72px] z-30 border-b border-[#E5E1E4]/10 bg-[#131315]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back to showtimes"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#E5E1E4]/70 transition hover:bg-[#E5E1E4]/10 hover:text-[#E5E1E4]"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back_ios_new</span>
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="kk-display truncate text-base font-bold leading-tight sm:text-xl">{title}</h1>
            <p className="truncate text-[10px] text-[#E5E1E4]/55 sm:text-xs">
              {locality}
              {dateText && <span className="mx-1.5 text-[#E5E1E4]/25">|</span>}
              {dateText}
              {timeText && <span className="mx-1.5 text-[#E5E1E4]/25">|</span>}
              {timeText}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition hover:bg-[#F5C542]/10"
            style={{ borderColor: `${C.kokum}99`, color: C.kokum }}
          >
            <span className="material-symbols-outlined text-[15px]">edit</span>
            {selected.length || limit} {selected.length === 1 || (!selected.length && limit === 1) ? 'Ticket' : 'Tickets'}
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-[1180px] px-3 pt-5 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#E5E1E4]/40">
            {stats.length} categories · {availableCount} seats available
          </p>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
              disabled={zoomIdx === 0}
              aria-label="Zoom out"
              className="kk-zoom flex h-8 w-8 items-center justify-center rounded-full border border-[#E5E1E4]/[0.12] text-[#E5E1E4]/70 disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-[18px]">zoom_out</span>
            </button>
            <button
              type="button"
              onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
              disabled={zoomIdx === ZOOM_STEPS.length - 1}
              aria-label="Zoom in"
              className="kk-zoom flex h-8 w-8 items-center justify-center rounded-full border border-[#E5E1E4]/[0.12] text-[#E5E1E4]/70 disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-[18px]">zoom_in</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto pb-5">
          <div className="mx-auto w-max px-1" style={{ zoom: ZOOM_STEPS[zoomIdx] }}>
            {sections.length === 0 ? (
              <p className="py-16 text-center text-sm text-[#E5E1E4]/55">
                No seats are configured for this show yet.
              </p>
            ) : (
              sections.map((section) => (
                <section key={section.name} className="mb-7">
                  <div className="mx-auto flex items-center gap-3">
                    <span className="kk-cat-line" />
                    <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[.18em] text-[#E5E1E4]/60">
                      {rupees(section.price)} {section.name}
                    </span>
                    <span className="kk-cat-line" />
                  </div>

                  <div className="mt-3 flex flex-col gap-1.5">
                    {section.rows.map((row) => (
                      <div key={`${section.name}-${row.label}`} className="flex items-center gap-2">
                        <span className="w-4 shrink-0 text-center text-[10px] font-semibold text-[#E5E1E4]/35">
                          {row.label}
                        </span>

                        <div className="kk-seat-row" style={{ '--kk-cols': cols }}>
                          {row.seats.map((seat) => {
                            const isSelected = selected.includes(seat.seat_id);
                            const unavailable = seat.status !== 'available' && !isSelected;
                            const isBest = bestsellerName === section.name && !isSelected && !unavailable;
                            const span = Math.max(1, Number(seat.col_span) || 1);

                            const palette = isSelected
                              ? { background: C.kokum, borderColor: C.kokum, color: '#fff' }
                              : unavailable
                                ? { background: 'rgba(169, 162, 158,.16)', borderColor: 'rgba(169, 162, 158,.28)', color: 'rgba(229, 225, 228,.26)' }
                                : isBest
                                  ? { background: 'transparent', borderColor: C.mango, color: C.mango }
                                  : { background: 'transparent', borderColor: 'rgba(187, 203, 182,.8)', color: 'rgba(187, 203, 182,.95)' };

                            return (
                              <button
                                key={seat.seat_id}
                                type="button"
                                disabled={unavailable}
                                onClick={() => toggle(seat)}
                                aria-pressed={isSelected}
                                aria-label={`Seat ${row.label}-${seat.seat_number}, ${section.name}, ${
                                  unavailable ? 'sold' : isSelected ? 'selected' : rupees(seat.price_minor || section.price)
                                }`}
                                title={`${row.label}-${seat.seat_number} · ${section.name} · ${rupees(seat.price_minor || section.price)}${isBest ? ' · Bestseller' : ''}`}
                                className="kk-seat"
                                style={{
                                  gridColumn: `${Number(seat.x) - minX + 1} / span ${span}`,
                                  ...palette,
                                  boxShadow: isSelected ? `0 0 0 1px ${C.shell}, 0 0 12px ${C.kokum}66` : 'none',
                                }}
                              >
                                {seat.accessible ? (
                                  <span className="text-[10px] leading-none" aria-hidden="true">♿</span>
                                ) : (
                                  seat.seat_number
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Legend + pay bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E5E1E4]/[0.12] bg-[#131315]/[0.96] backdrop-blur-xl">
        <div className="hidden items-center justify-center gap-7 border-b border-[#E5E1E4]/[0.08] px-4 py-2 text-[11px] text-[#E5E1E4]/60 md:flex">
          <Legend color="rgba(187, 203, 182,.9)" label="Available" />
          <Legend color="rgba(169, 162, 158,.45)" label="Sold" filled />
          <span className="inline-flex items-center gap-1.5">
            <Legend color={C.mango} label="Bestseller" />
            <span
              className="material-symbols-outlined cursor-help text-[14px] text-[#E5E1E4]/35"
              title="Most-loved seats in this screen, at the regular price."
            >
              info
            </span>
          </span>
          <Legend color={C.kokum} label="Selected" filled />
        </div>

        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs text-[#E5E1E4]/60">
              {selected.length} {selected.length === 1 ? 'seat' : 'seats'} selected
              <span className="hidden sm:inline"> · up to {limit}</span>
            </p>
            <p className="truncate text-[10px] text-[#E5E1E4]/35">
              {selectedSeats.length
                ? selectedSeats.map((seat) => `${seat.row_label}-${seat.seat_number}`).join(', ')
                : 'Pick a seat from the plan above'}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#E5E1E4]/40">Total</p>
              <p className="kk-display text-lg font-bold leading-tight sm:text-xl">
                {selected.length ? rupees(totalMinor) : '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={hold}
              disabled={!selected.length || holding}
              className="kk-pay min-w-[130px] rounded-lg px-5 py-3 text-sm font-bold text-[#131315] disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[170px]"
              style={{ background: C.kokum }}
            >
              {holding ? 'Holding seats…' : selected.length ? `Pay ${rupees(totalMinor)}` : 'Select seats'}
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <div
          className="kk-toast fixed bottom-28 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-lg px-4 py-2.5 text-center text-xs font-semibold shadow-xl"
          style={{ background: C.shell, color: C.ink }}
          role="status"
        >
          {notice}
        </div>
      )}

      {/* How many seats? */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#131315]/[0.82] px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="How many seats?"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPickerOpen(false);
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-[#E5E1E4] text-[#131315] shadow-2xl">
            <div className="relative px-6 pb-5 pt-6 sm:px-8">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                aria-label="Close seat count"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[#131315]/50 transition hover:bg-[#131315]/[0.08] hover:text-[#131315]"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>

              <h2 className="kk-display text-center text-2xl font-bold">How many seats?</h2>
              <p className="mt-1 text-center text-xs text-[#131315]/50">
                {availableCount} seats free · pick up to {maxSelectable}
              </p>

              <div className="mt-4 flex justify-center">
                <span
                  className="flex h-16 w-16 items-center justify-center rounded-full"
                  style={{ background: `${C.mango}22`, color: C.kokum }}
                  aria-hidden="true"
                >
                  <span className="material-symbols-outlined text-[34px]">two_wheeler</span>
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-1">
                {Array.from({ length: MAX_SEATS }, (_, i) => i + 1).map((n) => {
                  const active = draft === n;
                  const disabled = n > maxSelectable || n < selected.length;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={disabled}
                      onClick={() => setDraft(n)}
                      aria-pressed={active}
                      className={`kk-pill flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-25 ${
                        active ? 'text-[#131315]' : 'text-[#131315]/75 hover:bg-[#131315]/[0.08]'
                      }`}
                      style={active ? { background: C.kokum } : undefined}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mx-6 border-t border-dashed border-[#131315]/20 sm:mx-8" />

            <div className="overflow-x-auto px-6 py-4 sm:px-8">
              <div className="flex min-w-max items-start justify-center gap-7">
                {stats.map((stat) => {
                  const tone = stat.status === 'FILLED'
                    ? C.kokum
                    : stat.status === 'ALMOST FULL'
                      ? '#9A7712'
                      : '#A9BAA5';
                  return (
                    <div key={stat.name} className="min-w-[84px] text-center">
                      <p className="truncate text-[9px] font-bold uppercase tracking-[.1em] text-[#131315]/55">
                        {stat.name}
                      </p>
                      <p className="kk-display mt-1 text-base font-bold">{rupees(stat.price)}</p>
                      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[.08em]" style={{ color: tone }}>
                        {stat.status}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mx-6 flex items-center gap-2 rounded bg-[#131315]/5 px-3 py-2 text-[11px] text-[#131315]/70 sm:mx-8">
              <span className="h-3 w-3 shrink-0 rounded-[3px] border-2" style={{ borderColor: C.mango }} />
              <span>
                Book the <strong className="font-bold text-[#131315]">Bestseller</strong> seats in this cinema at no extra cost!
              </span>
            </div>

            <div className="p-6 pt-4 sm:px-8">
              <button
                type="button"
                onClick={confirmCount}
                className="kk-pay w-full rounded-lg py-3.5 text-sm font-bold text-[#131315]"
                style={{ background: C.kokum }}
              >
                Select Seats
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
