import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { assetUrl } from '../services/api.js';

export default function SeatSelection() {
  const { showId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [movie, setMovie] = useState(null);

  async function load() {
    const r = await api.get(`/shows/${showId}/seats`);
    setData(r.data);
    if (r.data.show) {
      try { const m = await api.get(`/movies/${r.data.show.movie_id || r.data.show.movieId}`); setMovie(m.data); } catch (e) {}
    }
  }
  useEffect(() => { load(); }, [showId]);

  if (!data) return <div className="min-h-screen bg-background flex items-center justify-center text-on-surface">Loading...</div>;

  const seats = data.seats || [];
  const show = data.show || {};

  function toggle(seat) {
    if (seat.status !== 'available' && !selected.includes(seat.seat_id)) return;
    if (selected.includes(seat.seat_id)) setSelected(selected.filter((x) => x !== seat.seat_id));
    else setSelected([...selected, seat.seat_id]);
  }

  async function hold() {
    try {
      const r = await api.post('/seat-holds', { showId, seatIds: selected, sessionRef: localStorage.getItem('sessionRef') || (localStorage.setItem('sessionRef', crypto.randomUUID()), localStorage.getItem('sessionRef')) });
      const holdData = { ...r.data, holdId: r.data.holdId || r.data.id, showId };
      localStorage.setItem('currentHold', JSON.stringify(holdData));
      navigate('/checkout', { state: holdData });
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  }

  const selectedSeats = seats.filter((s) => selected.includes(s.seat_id));
  const totalMinor = selectedSeats.reduce((a, s) => a + (s.price_minor || 0), 0);
  const catColor = (name, row) => {
    const n = (name || '').toLowerCase();
    if (n.includes('recliner')) return '#6366F1';
    if (n.includes('handicap')) return '#7bd0ff';
    if (row === 'N') return '#818CF8';
    if (n.includes('prime')) return '#A5B4FC';
    if (row === 'A' || row === 'B') return '#C7D2FE';
    return '#272a33';
  };

  // group rows
  const rowLabels = [...new Set(seats.map((s) => s.row_label))].sort();
  const xs = seats.map((s) => Number(s.x));
  const minX = seats.length ? Math.min(...xs) : 0;
  const maxX = seats.length ? Math.max(...xs) : 0;

  return (
    <div className="min-h-screen bg-background text-on-surface pt-20">
      {/* HUD Strip */}
      <div className="w-full max-w-[1440px] mx-auto px-4 md:px-8 py-4">
        <div className="w-full bg-surface-container rounded-xl shadow-lg p-4 lg:p-6 mb-6 relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-20 rounded-lg bg-surface-container-high overflow-hidden shrink-0 shadow-md">
                {movie?.thumbnail_url && <img className="w-full h-full object-cover" src={assetUrl(movie.thumbnail_url)} alt={movie.title} />}
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-1 py-0.5 rounded bg-surface-container-highest text-secondary-fixed-dim font-label-sm text-label-sm">UA</span>
                  <span className="px-1 py-0.5 rounded bg-surface-container-highest text-tertiary font-label-sm text-label-sm">DOLBY ATMOS</span>
                </div>
                <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight mt-1 truncate">
                  {movie?.title || 'Show'} — Live Screening
                </h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1 mt-0.5">
                  <span className="material-symbols-outlined text-primary text-[16px]">location_on</span>
                  {show.auditorium_name || 'Auditorium'} • {new Date(show.starts_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Seat blueprint */}
          <div className="lg:col-span-8 flex flex-col bg-surface-container-low rounded-xl p-4 lg:p-6 shadow-xl relative overflow-hidden">
            {/* Legend */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-sm bg-surface-container-high"></span><span className="font-label-sm text-label-sm text-on-surface-variant">Available</span></div>
                <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-sm bg-primary-container shadow-[0_0_8px_rgba(129,140,248,0.7)] flex items-center justify-center"><span className="material-symbols-outlined text-[12px] text-on-primary font-bold">check</span></span><span className="font-label-sm text-label-sm text-primary font-medium">Selected ({selected.length})</span></div>
                <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-sm bg-surface-container-lowest opacity-40"></span><span className="font-label-sm text-label-sm text-on-surface-variant/70">Sold / Reserved</span></div>
              </div>
            </div>

            {/* Seat grid (screen + seats scroll together) */}
            <div className="w-full overflow-x-auto pb-4">
              <p className="text-center text-on-surface-variant/70 text-xs mb-1">Seats: {seats.length} · Rows: {rowLabels.length}</p>
              {seats.length === 0 && <p className="text-center text-on-surface-variant">No seats available.</p>}
              <div className="min-w-[620px]">
              {/* Projection horizon */}
              <div className="relative w-full flex flex-col items-center justify-center pt-2 pb-6">
                <div className="absolute -top-16 w-3/4 h-40 bg-[radial-gradient(ellipse_at_top,rgba(129,140,248,0.18),rgba(129,140,248,0.05)_45%,transparent_75%)] blur-3xl pointer-events-none rounded-full"></div>
                <div className="relative w-full max-w-xl h-10 flex items-center justify-center">
                  <svg className="w-full h-8 overflow-visible" fill="none" preserveAspectRatio="none" viewBox="0 0 500 40">
                    <path className="drop-shadow-[0_0_12px_#818CF8]" d="M 20 32 Q 250 2 480 32" stroke="#818CF8" strokeLinecap="round" strokeWidth="3"></path>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center -translate-y-1">
                    <span className="font-label-sm text-label-sm tracking-[0.25em] text-primary uppercase drop-shadow-[0_0_8px_rgba(129,140,248,0.9)] bg-surface-container-low px-2 rounded-full">SCREEN</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2">
                {rowLabels.map((row) => {
                  const cells = Array(maxX - minX + 1).fill(null);
                  seats.forEach((s) => { if (s.row_label === row) cells[Number(s.x) - minX] = s; });
                  return (
                    <div key={row} className="flex items-center justify-between w-full">
                      <span className="w-6 text-center font-label-md text-label-md text-on-surface-variant font-bold">{row}</span>
                      <div className="flex items-center justify-center gap-1 flex-1 px-3">
                        {cells.map((s, i) => {
                          if (s === null) return <div key={i} className="w-7 h-7" />;
                          const isSel = selected.includes(s.seat_id);
                          const isSold = s.status !== 'available' && !isSel;
                          const catColor = (name, row) => {
                            const n = (name || '').toLowerCase();
                            if (n.includes('recliner')) return '#6366F1';
                            if (n.includes('handicap')) return '#7bd0ff';
                            if (row === 'N') return '#818CF8';
                            if (n.includes('prime')) return '#A5B4FC';
                            if (row === 'A' || row === 'B') return '#C7D2FE';
                            return '#272a33';
                          };
                          let bg = '';
                          if (isSel) bg = 'bg-primary-container text-on-primary-container shadow-[0_0_12px_rgba(129,140,248,0.9)] ring-2 ring-primary';
                          if (isSold) bg = 'cursor-not-allowed';
                          return (
                            <button
                              key={s.seat_id}
                              disabled={isSold}
                              onClick={() => toggle(s)}
                              aria-label={`Seat ${row}-${s.seat_number}`}
                              className={`w-7 h-7 rounded-sm flex items-center justify-center transition-all ${bg}`}
                              style={isSold ? { backgroundColor: '#3D4869' } : (!isSel ? { backgroundColor: catColor(s.category_name, row) } : undefined)}
                            >
                              {isSel ? <span className="material-symbols-outlined text-[12px] font-bold">check</span> : <span className="text-[9px] leading-none text-white/90">{s.seat_number}</span>}
                            </button>
                          );
                        })}
                      </div>
                      <span className="w-6 text-center font-label-md text-label-md text-on-surface-variant font-bold">{row}</span>
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
            {/* Category breakdown (mobile only) */}
            <div className="lg:hidden mt-4 bg-surface-container-low rounded-xl p-3">
              <div className="flex flex-col gap-1 text-sm">
                {Object.entries(seats.reduce((acc, s) => { const c = s.category_name || 'Unknown'; acc[c] = (acc[c]||0)+1; return acc; }, {})).map(([cat, cnt]) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-on-surface-variant"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: catColor(cat) }}></span>{cat}</span>
                    <span className="text-on-surface font-medium">{cnt} <span className="text-on-surface-variant/70 text-xs">({Math.round(cnt/seats.length*100)}%)</span></span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-surface-container-highest pt-1 mt-1">
                  <span className="text-on-surface font-semibold">Total</span>
                  <span className="text-on-surface font-bold">{seats.length} <span className="text-on-surface-variant/70 text-xs">(100%)</span></span>
                </div>
                {seats.find((s) => (s.category_name||'').toLowerCase().includes('handicap')) && (
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant">Handicapped Seat</span>
                    <span className="text-on-surface font-medium">1 <span className="text-on-surface-variant/70 text-xs">(A-{seats.find((s) => (s.category_name||'').toLowerCase().includes('handicap')).seat_number})</span></span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Booking summary panel (desktop only) */}
          <div className="hidden lg:flex lg:col-span-4 flex-col gap-4 sticky top-24">
            <div className="w-full bg-surface-container rounded-xl shadow-2xl p-4 lg:p-6 flex flex-col gap-4 relative overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-surface-container-highest">
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-secondary uppercase tracking-widest">Booking Ledger</span>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Seat Allocation</h2>
                </div>
                <span className="px-2 py-1 rounded-full bg-primary/10 text-primary font-label-sm text-label-sm font-semibold">{selected.length} SEATS HELD</span>
              </div>
              {selectedSeats.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {selectedSeats.map((s) => (
                    <div key={s.seat_id} className="bg-surface-container-high p-2 rounded-lg flex flex-col gap-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-label-sm text-label-sm text-primary font-semibold">{s.category_name || 'SEAT'} • {s.row_label}-{s.seat_number}</span>
                      </div>
                      <span className="font-headline-sm text-headline-sm text-on-surface font-bold">₹{((s.price_minor || 0) / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Category breakdown */}
              <div className="bg-surface-container-low rounded-xl p-3">
                <div className="flex flex-col gap-1 text-sm">
                  {Object.entries(seats.reduce((acc, s) => { const c = s.category_name || 'Unknown'; acc[c] = (acc[c]||0)+1; return acc; }, {})).map(([cat, cnt]) => (
                    <div key={cat} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-on-surface-variant"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: catColor(cat, (seats.find((s) => (s.category_name || 'Unknown') === cat) || {}).row_label) }}></span>{cat}</span>
                      <span className="text-on-surface font-medium">{cnt} <span className="text-on-surface-variant/70 text-xs">({Math.round(cnt/seats.length*100)}%)</span></span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-surface-container-highest pt-1 mt-1">
                    <span className="text-on-surface font-semibold">Total</span>
                    <span className="text-on-surface font-bold">{seats.length} <span className="text-on-surface-variant/70 text-xs">(100%)</span></span>
                  </div>
                  {seats.find((s) => (s.category_name||'').toLowerCase().includes('handicap')) && (
                    <div className="flex items-center justify-between">
                      <span className="text-on-surface-variant">Handicapped Seat</span>
                      <span className="text-on-surface font-medium">1 <span className="text-on-surface-variant/70 text-xs">(A-{seats.find((s) => (s.category_name||'').toLowerCase().includes('handicap')).seat_number})</span></span>
                    </div>
                  )}
                </div>
              </div>

              <button
                disabled={selected.length === 0}
                onClick={hold}
                className="w-full py-3.5 px-6 rounded-xl bg-primary-container hover:bg-primary text-on-primary-container font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(129,140,248,0.45)] hover:shadow-[0_0_32px_rgba(129,140,248,0.6)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                type="button"
              >
                <span>Proceed to Payment (₹{(totalMinor / 100).toFixed(2)})</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      {selected.length > 0 && (
        <>
          <div className="fixed inset-0 z-40 bg-transparent pointer-events-none lg:hidden"></div>
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface-container rounded-t-3xl shadow-2xl p-6 pb-8 animate-[slideUp_0.3s_ease-out] pointer-events-auto lg:hidden">
            <div className="w-12 h-1.5 bg-surface-container-highest rounded-full mx-auto mb-4"></div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold mb-2 text-center">Total Payable Amount</h2>
            <div className="text-center mb-2">
              <span className="font-display-mobile text-display-mobile text-primary font-bold tracking-tight">Rs.{(totalMinor / 100).toFixed(2)}</span>
            </div>
            <p className="text-sm text-on-surface-variant text-center mb-3">{selected.length} seat(s) selected</p>
            <div className="mb-3 text-xs space-y-1">
              {Object.entries(selectedSeats.reduce((acc, s) => {
                const c = s.category_name || 'Unknown';
                if (!acc[c]) acc[c] = { count: 0, amount: 0 };
                acc[c].count += 1;
                acc[c].amount += (s.price_minor || 0);
                return acc;
              }, {})).map(([cat, info]) => (
                <div key={cat} className="flex items-center justify-between text-sm">
                  <span className="text-on-surface">{cat} <span className="text-on-surface-variant/70">x {info.count}</span></span>
                  <span className="text-on-surface font-medium">Rs.{(info.amount / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSelected([])} className="flex-1 py-2.5 rounded-xl bg-surface-container-high text-on-surface font-label-lg text-label-lg font-bold hover:bg-surface-bright transition-all">Cancel</button>
              <button onClick={hold} className="flex-1 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary-container font-label-lg text-label-lg font-bold shadow-[0_0_24px_rgba(129,140,248,0.45)] transition-all">Proceed</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
