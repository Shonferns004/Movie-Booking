import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import api, { assetUrl } from '../services/api.js';

const COLORS = {
  ink: '#0A2A31',
  tide: '#123E47',
  shell: '#EFEBE0',
  kokum: '#C2305E',
  mango: '#F4B63F',
  deep: '#071E23',
};

const money = (minor = 0) =>
  `₹${(Number(minor || 0) / 100).toFixed(2)}`;

export default function SeatSelection() {
  const { showId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [movie, setMovie] = useState(null);
  const [loadingError, setLoadingError] = useState('');
  const pageRef = useRef(null);

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
          // Seat selection remains usable if movie metadata is unavailable.
        }
      }
    } catch (e) {
      setLoadingError(e?.response?.data?.error || e.message || 'Could not load seats.');
    }
  }

  useEffect(() => { load(); }, [showId]);

  useEffect(() => {
    if (pageRef.current && data) {
      gsap.fromTo(
        pageRef.current,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out' }
      );
    }
  }, [data]);

  const seats = data?.seats || [];
  const show = data?.show || {};
  const selectedSeats = useMemo(
    () => seats.filter((seat) => selected.includes(seat.seat_id)),
    [seats, selected]
  );
  const totalMinor = selectedSeats.reduce((sum, seat) => sum + (seat.price_minor || 0), 0);
  const rowLabels = [...new Set(seats.map((seat) => seat.row_label))].sort();
  const xs = seats.map((seat) => Number(seat.x)).filter(Number.isFinite);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;

  const categoryColor = (name, row) => {
    const n = (name || '').toLowerCase();
    if (n.includes('recliner')) return '#C2305E';
    if (n.includes('handicap')) return '#F4B63F';
    if (n.includes('prime')) return '#E1A5B6';
    if (row === 'N') return '#D88AA2';
    if (row === 'A' || row === 'B') return '#E8C9CF';
    return '#7BA6A7';
  };

  function toggle(seat) {
    const isSelected = selected.includes(seat.seat_id);
    if (seat.status !== 'available' && !isSelected) return;
    setSelected((current) =>
      isSelected
        ? current.filter((id) => id !== seat.seat_id)
        : [...current, seat.seat_id]
    );
  }

  async function hold() {
    if (!selected.length) return;
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
      navigate('/checkout', { state: holdData });
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  const categories = Object.entries(
    seats.reduce((acc, seat) => {
      const category = seat.category_name || 'Standard';
      if (!acc[category]) acc[category] = { count: 0, color: categoryColor(category, seat.row_label) };
      acc[category].count += 1;
      return acc;
    }, {})
  );
  const selectedByCategory = Object.entries(
    selectedSeats.reduce((acc, seat) => {
      const category = seat.category_name || 'Standard';
      if (!acc[category]) acc[category] = { count: 0, amount: 0 };
      acc[category].count += 1;
      acc[category].amount += seat.price_minor || 0;
      return acc;
    }, {})
  );
  const handicapSeat = seats.find((seat) =>
    (seat.category_name || '').toLowerCase().includes('handicap')
  );

  if (!data) {
    return (
      <div className="kk-seat-body min-h-screen flex items-center justify-center px-5 text-center" style={{ background: COLORS.ink, color: COLORS.shell }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Public+Sans:wght@400;500;600;700&display=swap'); .kk-seat-body{font-family:'Public Sans',sans-serif}.kk-seat-display{font-family:'Fraunces',Georgia,serif}`}</style>
        <div className="max-w-sm">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full border-2 border-dashed animate-spin" style={{ borderColor: COLORS.mango, borderTopColor: 'transparent' }} />
          <h1 className="kk-seat-display text-2xl font-bold">Preparing your seat map</h1>
          <p className="mt-2 text-sm opacity-70">{loadingError || 'Finding the best seats for your screening…'}</p>
          {loadingError && <button onClick={load} className="mt-5 rounded-xl px-5 py-2.5 font-semibold text-white" style={{ background: COLORS.kokum }}>Try again</button>}
        </div>
      </div>
    );
  }

  return (
    <div ref={pageRef} className="kk-seat-body min-h-screen pb-32 pt-20 md:pb-12" style={{ background: COLORS.ink, color: COLORS.shell }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Public+Sans:wght@400;500;600;700&display=swap');
        .kk-seat-body{font-family:'Public Sans',system-ui,sans-serif}
        .kk-seat-display{font-family:'Fraunces',Georgia,serif}
        .kk-seat-btn{transition:transform .18s ease,box-shadow .18s ease,filter .18s ease}
        .kk-seat-btn:not(:disabled):hover{transform:translateY(-2px);filter:brightness(1.06)}
        .kk-seat-cta{position:relative;overflow:hidden;transition:transform .2s ease,background .2s ease}
        .kk-seat-cta:not(:disabled):hover{transform:translateY(-2px);background:#a82651}
        .kk-seat-cta:disabled{opacity:.42;cursor:not-allowed}
        .kk-seat-card{box-shadow:0 24px 70px rgba(0,0,0,.18)}
        .kk-seat-screen{filter:drop-shadow(0 0 10px rgba(244,182,63,.35))}
        @keyframes kk-seat-shimmer{from{transform:translateX(-130%)}to{transform:translateX(130%)}}
        .kk-seat-cta::after{content:'';position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.3) 50%,transparent 65%);transform:translateX(-130%)}
        .kk-seat-cta:not(:disabled):hover::after{animation:kk-seat-shimmer .75s ease}
        @media(prefers-reduced-motion:reduce){.kk-seat-btn,.kk-seat-cta{transition:none}.kk-seat-cta::after{display:none}}
      `}</style>

      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[.24em]" style={{ color: COLORS.mango }}>Your cinema experience</p>
            <h1 className="kk-seat-display text-3xl font-bold tracking-tight sm:text-4xl">Choose your seats<span style={{ color: COLORS.kokum }}>.</span></h1>
            <p className="mt-2 text-sm" style={{ color: `${COLORS.shell}B8` }}>Pick your favourite spot. We’ll hold your seats while you check out.</p>
          </div>
          <button onClick={() => navigate(-1)} className="rounded-full border px-4 py-2 text-sm font-semibold kk-seat-btn" style={{ borderColor: `${COLORS.shell}40`, color: COLORS.shell }}>
            ← Back to shows
          </button>
        </div>

        <section className="kk-seat-card relative mb-6 overflow-hidden rounded-3xl p-4 sm:p-6 lg:p-7" style={{ background: COLORS.shell, color: COLORS.ink }}>
          <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full blur-3xl" style={{ background: `${COLORS.mango}35` }} />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl shadow-lg sm:h-32 sm:w-24" style={{ background: COLORS.tide }}>
              {movie?.thumbnail_url ? (
                <img src={assetUrl(movie.thumbnail_url)} alt={movie.title || 'Movie poster'} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center p-2 text-center text-xs font-bold" style={{ color: COLORS.shell }}>KONKANI CINEMA</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap gap-2">
                <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ background: COLORS.mango, color: COLORS.ink }}>{movie?.certification || 'UA'}</span>
                <span className="rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ borderColor: `${COLORS.ink}30` }}>Cinema screening</span>
              </div>
              <h2 className="kk-seat-display text-2xl font-bold leading-tight sm:text-3xl">{movie?.title || 'Movie screening'}</h2>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm" style={{ color: `${COLORS.ink}B8` }}>
                <span className="inline-flex items-center gap-2"><span style={{ color: COLORS.kokum }}>⌖</span>{show.auditorium_name || 'Auditorium'}</span>
                {show.starts_at && <span className="inline-flex items-center gap-2"><span style={{ color: COLORS.kokum }}>◷</span>{new Date(show.starts_at).toLocaleString()}</span>}
              </div>
            </div>
            <div className="hidden min-w-28 border-l pl-6 text-right sm:block" style={{ borderColor: `${COLORS.ink}20` }}>
              <p className="text-xs uppercase tracking-widest" style={{ color: `${COLORS.ink}8A` }}>Seat map</p>
              <p className="kk-seat-display mt-1 text-3xl font-bold">{seats.length}</p>
              <p className="text-xs" style={{ color: `${COLORS.ink}A0` }}>{rowLabels.length} rows</p>
            </div>
          </div>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(310px,.8fr)]">
          <section className="min-w-0 overflow-hidden rounded-3xl border p-4 sm:p-6 lg:p-7" style={{ background: COLORS.tide, borderColor: `${COLORS.shell}12` }}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.2em]" style={{ color: COLORS.mango }}>The auditorium</p>
                <h2 className="kk-seat-display mt-1 text-2xl font-bold">Select your spot</h2>
              </div>
              <span className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: `${COLORS.ink}80`, color: COLORS.shell }}>{selected.length} selected</span>
            </div>

            <div className="mb-5 flex flex-wrap gap-x-5 gap-y-3 border-b pb-5 text-xs" style={{ borderColor: `${COLORS.shell}20` }}>
              <span className="flex items-center gap-2"><i className="h-3.5 w-3.5 rounded-sm" style={{ background: '#7BA6A7' }} />Available</span>
              <span className="flex items-center gap-2"><i className="h-3.5 w-3.5 rounded-sm" style={{ background: COLORS.kokum }} />Selected</span>
              <span className="flex items-center gap-2"><i className="h-3.5 w-3.5 rounded-sm" style={{ background: '#52676A' }} />Sold / reserved</span>
              <span className="flex items-center gap-2"><i className="h-3.5 w-3.5 rounded-sm" style={{ background: COLORS.mango }} />Accessible</span>
            </div>

            <div className="overflow-x-auto pb-3">
              <div className="min-w-[560px] px-1">
                <div className="relative mx-auto mb-9 mt-2 max-w-xl pt-2 text-center">
                  <div className="absolute -inset-x-8 -top-7 h-20 rounded-[50%] blur-2xl" style={{ background: `${COLORS.mango}12` }} />
                  <svg className="kk-seat-screen relative mx-auto h-10 w-full" viewBox="0 0 500 40" fill="none" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M 18 32 Q 250 -4 482 32" stroke={COLORS.mango} strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  <span className="relative -mt-1 inline-flex rounded-full px-5 py-1 text-[10px] font-bold uppercase tracking-[.35em]" style={{ background: COLORS.ink, color: COLORS.mango }}>Screen</span>
                </div>

                {seats.length === 0 ? (
                  <p className="py-12 text-center text-sm" style={{ color: `${COLORS.shell}A0` }}>No seats are configured for this show yet.</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {rowLabels.map((row) => {
                      const cells = Array(maxX - minX + 1).fill(null);
                      seats.forEach((seat) => {
                        if (seat.row_label === row) cells[Number(seat.x) - minX] = seat;
                      });
                      return (
                        <div key={row} className="flex items-center gap-2">
                          <span className="w-5 shrink-0 text-center text-xs font-bold" style={{ color: COLORS.mango }}>{row}</span>
                          <div className="flex min-w-0 flex-1 items-center justify-center gap-1 sm:gap-1.5">
                            {cells.map((seat, i) => {
                              if (!seat) return <span key={`gap-${row}-${i}`} className="h-7 w-5 shrink-0 sm:w-7" />;
                              const isSelected = selected.includes(seat.seat_id);
                              const unavailable = seat.status !== 'available' && !isSelected;
                              const baseColor = categoryColor(seat.category_name, row);
                              return (
                                <button
                                  key={seat.seat_id}
                                  type="button"
                                  disabled={unavailable}
                                  onClick={() => toggle(seat)}
                                  aria-pressed={isSelected}
                                  aria-label={`Seat ${row}-${seat.seat_number}, ${seat.category_name || 'Standard'}, ${unavailable ? 'unavailable' : isSelected ? 'selected' : money(seat.price_minor)}`}
                                  title={`${row}-${seat.seat_number} · ${seat.category_name || 'Standard'} · ${money(seat.price_minor)}`}
                                  className="kk-seat-btn flex h-7 w-5 shrink-0 items-center justify-center rounded-t-md rounded-b-sm text-[9px] font-bold sm:h-8 sm:w-7 sm:text-[10px]"
                                  style={{
                                    background: unavailable ? '#52676A' : isSelected ? COLORS.kokum : baseColor,
                                    color: unavailable ? '#A3B5B5' : isSelected ? '#FFFFFF' : COLORS.ink,
                                    opacity: unavailable ? .48 : 1,
                                    cursor: unavailable ? 'not-allowed' : 'pointer',
                                    boxShadow: isSelected ? `0 0 0 2px ${COLORS.shell}, 0 0 15px ${COLORS.kokum}70` : '0 2px 0 rgba(0,0,0,.18)',
                                  }}
                                >
                                  {isSelected ? '✓' : seat.seat_number}
                                </button>
                              );
                            })}
                          </div>
                          <span className="w-5 shrink-0 text-center text-xs font-bold" style={{ color: COLORS.mango }}>{row}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-3 border-t pt-5 sm:grid-cols-2" style={{ borderColor: `${COLORS.shell}20` }}>
              {categories.map(([category, info]) => (
                <div key={category} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: `${COLORS.ink}60` }}>
                  <span className="flex min-w-0 items-center gap-2 text-xs"><i className="h-3 w-3 shrink-0 rounded-sm" style={{ background: info.color }} /><span className="truncate">{category}</span></span>
                  <span className="shrink-0 text-xs font-semibold" style={{ color: `${COLORS.shell}B8` }}>{info.count} seats</span>
                </div>
              ))}
            </div>
            {handicapSeat && (
              <p className="mt-3 text-xs" style={{ color: `${COLORS.shell}A8` }}>Accessible seating is available at {handicapSeat.row_label}-{handicapSeat.seat_number}.</p>
            )}
          </section>

          <aside className="hidden lg:block lg:sticky lg:top-24">
            <div className="kk-seat-card overflow-hidden rounded-3xl" style={{ background: COLORS.shell, color: COLORS.ink }}>
              <div className="p-6" style={{ background: COLORS.mango }}>
                <p className="text-xs font-bold uppercase tracking-[.22em]">Your ticket</p>
                <h2 className="kk-seat-display mt-1 text-2xl font-bold">Booking summary</h2>
                <p className="mt-1 text-sm" style={{ color: `${COLORS.ink}B8` }}>Review your seats before checkout.</p>
              </div>
              <div className="p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between border-b border-dashed pb-4" style={{ borderColor: `${COLORS.ink}35` }}>
                  <span className="text-sm" style={{ color: `${COLORS.ink}A0` }}>Selected seats</span>
                  <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: COLORS.kokum }}>{selected.length}</span>
                </div>

                {selectedSeats.length ? (
                  <div className="mb-5 flex flex-col gap-2">
                    {selectedSeats.map((seat) => (
                      <div key={seat.seat_id} className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: '#E4DFD3' }}>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold">{seat.category_name || 'Standard'}</p>
                          <p className="mt-1 text-xs" style={{ color: `${COLORS.ink}9C` }}>Row {seat.row_label} · Seat {seat.seat_number}</p>
                        </div>
                        <span className="shrink-0 text-sm font-bold">{money(seat.price_minor)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mb-5 rounded-2xl border border-dashed px-4 py-7 text-center" style={{ borderColor: `${COLORS.ink}35` }}>
                    <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full text-xl" style={{ background: '#E4DFD3' }}>⌑</div>
                    <p className="text-sm font-semibold">Your seats go here</p>
                    <p className="mt-1 text-xs" style={{ color: `${COLORS.ink}9C` }}>Select seats from the map to begin.</p>
                  </div>
                )}

                {selectedByCategory.length > 0 && (
                  <div className="mb-5 space-y-2">
                    {selectedByCategory.map(([category, info]) => (
                      <div key={category} className="flex justify-between gap-3 text-xs">
                        <span style={{ color: `${COLORS.ink}A0` }}>{category} × {info.count}</span>
                        <span className="font-semibold">{money(info.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-dashed pt-4" style={{ borderColor: `${COLORS.ink}35` }}>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs" style={{ color: `${COLORS.ink}A0` }}>Total payable</p>
                      <p className="kk-seat-display mt-1 text-3xl font-bold">{money(totalMinor)}</p>
                    </div>
                    <span className="pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.kokum }}>Incl. selected seats</span>
                  </div>
                  <button type="button" disabled={!selected.length} onClick={hold} className="kk-seat-cta mt-5 w-full rounded-xl px-5 py-4 text-sm font-bold text-white" style={{ background: COLORS.kokum }}>
                    Continue to checkout <span className="ml-1">→</span>
                  </button>
                  <p className="mt-3 text-center text-[10px]" style={{ color: `${COLORS.ink}8A` }}>Seats are held when you continue to checkout.</p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t-2 border-dashed px-6 py-3 text-[10px] font-bold uppercase tracking-[.18em]" style={{ borderColor: `${COLORS.ink}30`, background: '#E4DFD3', color: `${COLORS.ink}8A` }}>
                <span>Konkani Samudai</span><span>Enjoy the show ✦</span>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl lg:hidden" style={{ background: COLORS.shell, color: COLORS.ink, borderColor: `${COLORS.ink}20` }}>
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs" style={{ color: `${COLORS.ink}9C` }}>{selected.length} seat{selected.length === 1 ? '' : 's'} selected</p>
              <p className="kk-seat-display truncate text-2xl font-bold">{money(totalMinor)}</p>
              <p className="truncate text-[10px]" style={{ color: `${COLORS.ink}8A` }}>{selectedSeats.map((seat) => `${seat.row_label}-${seat.seat_number}`).join(', ')}</p>
            </div>
            <button type="button" onClick={hold} className="kk-seat-cta shrink-0 rounded-xl px-5 py-3.5 text-sm font-bold text-white" style={{ background: COLORS.kokum }}>
              Continue <span className="ml-1">→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
