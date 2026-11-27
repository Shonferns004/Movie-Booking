import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { gsap } from 'gsap';
import api, { assetUrl } from '../services/api.js';
import { useSileoNotice } from '../hooks/useSileoNotice.js';
import { prefersReducedMotion } from '../hooks/useMotion.js';
import { useRealtime } from '../services/realtime.js';
import UiIcon from '../components/UiIcon.jsx';
import BookingPayment from '../components/BookingPayment.jsx';
import BookingTicket from '../components/BookingTicket.jsx';

const C = {
  ink: '#1E2227',
  tide: '#262C33',
  shell: '#F2F0EC',
  kokum: '#C8FF1F',
  mango: '#C8FF1F',
  green: '#B6E36A',
  sold: '#B5AFA6',
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

function dateKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
}

const STYLES = `
.kk-seat-body { font-family: 'Inter', system-ui, sans-serif; }
.kk-display { font-family: 'Tempting', Georgia, serif; }

.kk-seat {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: auto; aspect-ratio: 1; border-radius: 2px; border: 1px solid transparent;
  font-size: clamp(9px, 0.7vw, 11px); font-weight: 700; line-height: 1;
  transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
}
.kk-seat:not(:disabled) { cursor: pointer; }
.kk-seat:not(:disabled):hover { transform: translateY(-1px) scale(1.07); z-index: 1; }
.kk-seat:disabled { cursor: not-allowed; }
.kk-seat-row { flex: 1 1 auto; display: grid; grid-template-columns: repeat(var(--kk-cols), minmax(0, 1fr)); gap: 3px; width: 100%; max-width: 600px; }
.kk-cat-line { height: 1px; flex: 1 1 0%; background: rgba(242,240,236,.14); }
@media (max-width: 767px) {
  .kk-seat-row { grid-template-columns: repeat(var(--kk-cols), 15px); gap: 2px; width: 100%; max-width: none; }
  .kk-seat { font-size: 8px; }
  .kk-seat-line { justify-content: flex-start; width: 100%; min-width: 0; gap: 0; }
}
.kk-screen { display: flex; flex-direction: column; align-items: center; gap: 8px; width: min(70%, 460px); margin: 0 auto 24px; color: var(--muted); }
.kk-screen i { display: block; width: 100%; height: 3px; background: linear-gradient(90deg, transparent, rgba(200,255,31,.65), transparent); border-radius: 999px; }
.kk-screen span { font-size: 9px; font-weight: 700; letter-spacing: .24em; text-transform: uppercase; }

.kk-pay { transition: background-color .2s ease, transform .2s ease, opacity .2s ease; }
.kk-pay:not(:disabled):hover { background-color: #A8D819; transform: translateY(-1px); }

.kk-pill { transition: background-color .16s ease, color .16s ease, transform .16s ease; }
.kk-pill:not(:disabled):hover { transform: translateY(-1px); }

.kk-zoom { transition: background-color .16s ease, color .16s ease; }
.kk-zoom:not(:disabled):hover { background-color: rgba(242,240,236,.12); }

.kk-toast { animation: kk-toast-in .22s ease both; }
@keyframes kk-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }


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
  const layoutRef = useRef(null);

  const [data, setData] = useState(null);
  const [movie, setMovie] = useState(null);
  const [showMeta, setShowMeta] = useState(null);
  const [selected, setSelected] = useState([]);
  const [step, setStep] = useState("seats");
  const [activeHold, setActiveHold] = useState(null);
  const [activeBooking, setActiveBooking] = useState(null);
  const [movieShows, setMovieShows] = useState([]);
  const [limit, setLimit] = useState(10);
  const [draft, setDraft] = useState(10);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [loadingError, setLoadingError] = useState('');
  const [selectionOpen, setSelectionOpen] = useState(false);

  useSileoNotice(notice, 'error', { title: 'Seat selection' });
  useSileoNotice(loadingError, 'error', { title: 'Could not load seats' });
  const [holding, setHolding] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(2);

  useEffect(() => {
    if (selected.length === 0 || step !== 'seats') setSelectionOpen(false);
  }, [selected.length, step]);

  useLayoutEffect(() => {
    const scope = layoutRef.current;
    if (!scope || !data || prefersReducedMotion()) return undefined;
    const context = gsap.context(() => {
      const targets = gsap.utils.toArray('[data-seat-enter]', scope);
      if (!targets.length) return;
      gsap.fromTo(
        targets,
        { autoAlpha: 0, y: 18 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.55,
          ease: 'power3.out',
          stagger: 0.07,
          overwrite: 'auto',
          clearProps: 'transform',
        },
      );
    }, scope);
    return () => context.revert();
  }, [data, step]);

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
        const list = Array.isArray(r.data) ? r.data : [];
        if (active) setMovieShows(list.filter((row) => row.status !== 'cancelled'));
        const match = list.find((s) => s.id === showId || s.id === show.id);
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
    setSelectionOpen(true);
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
      setActiveHold(holdData);
      setStep('payment');
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
      <div className="min-h-screen bg-[#1E2227] px-4 pb-10 pt-5 text-[#F2F0EC] sm:px-6">
        <span className="sr-only" role="status">Loading seat map</span>
        {loadingError ? (
          <div className="mx-auto mt-24 max-w-md rounded-2xl border border-[#F08A80]/30 bg-[#252A30] p-8 text-center">
            <h1 className="font-editorial text-2xl font-semibold">Could not load the seat map</h1>
            <p className="mt-2 text-sm leading-relaxed text-[#B5AFA6]">{loadingError}</p>
            <button type="button" onClick={load} className="mt-5 rounded-xl bg-[#C8FF1F] px-5 py-2.5 text-xs font-semibold text-[#1E2227]">
              Try again
            </button>
          </div>
        ) : (
          <div className="mx-auto grid max-w-7xl animate-pulse grid-cols-1 gap-7 lg:grid-cols-[250px_minmax(0,1fr)_170px]">
            <aside className="space-y-4">
              <div className="h-40 w-28 rounded-md bg-[#2A3037]" />
              <div className="h-3 w-24 rounded bg-[#2A3037]" />
              <div className="h-7 w-28 rounded bg-[#2A3037]" />
              <div className="h-16 rounded-lg bg-[#252A30]" />
              <div className="h-10 rounded-lg bg-[#252A30]" />
            </aside>

            <div className="min-w-0">
              <div className="h-3 w-52 rounded bg-[#2A3037]" />
              <div className="mt-2 h-9 w-72 max-w-full rounded bg-[#2A3037]" />
              <div className="mt-3 h-3 w-44 rounded bg-[#252A30]" />
              <div className="mt-5 flex gap-4">
                <div className="h-5 w-28 rounded-full bg-[#2A3037]" />
                <div className="h-5 w-20 rounded-full bg-[#252A30]" />
                <div className="h-5 w-16 rounded-full bg-[#252A30]" />
              </div>
              <div className="mx-auto mt-8 h-8 w-3/4 rounded-t-full bg-[#2A3037]" />
              <div className="mt-5 space-y-2">
                {Array.from({ length: 8 }).map((_, rowIndex) => (
                  <div key={rowIndex} className="flex items-center justify-center gap-1.5">
                    <div className="h-3 w-3 rounded bg-[#252A30]" />
                    {Array.from({ length: 18 }).map((__, seatIndex) => (
                      <div
                        key={seatIndex}
                        className={`h-3 w-3 rounded-sm sm:h-5 sm:w-5 ${
                          (rowIndex * 18 + seatIndex) % 7 === 0 ? 'bg-[#3A424B]' : 'bg-[#252A30]'
                        }`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <aside className="space-y-6">
              <div className="h-3 w-12 rounded bg-[#252A30]" />
              <div className="h-9 w-24 rounded bg-[#2A3037]" />
              <div className="h-3 w-14 rounded bg-[#252A30]" />
              <div className="h-8 w-24 rounded bg-[#2A3037]" />
              <div className="h-3 w-12 rounded bg-[#252A30]" />
              <div className="h-4 w-28 rounded bg-[#2A3037]" />
            </aside>
          </div>
        )}
      </div>
    );
  }

  const format = /dolby/i.test(showMeta?.auditorium_name || '') ? 'Dolby Atmos' : '2K Laser';
  const showDate = show.starts_at ? new Date(show.starts_at) : null;
  const dayNumber = showDate && !Number.isNaN(showDate.getTime())
    ? showDate.toLocaleDateString('en-IN', { day: '2-digit' })
    : '--';
  const monthLabel = showDate && !Number.isNaN(showDate.getTime())
    ? showDate.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()
    : '---';
  const posterPath = movie?.thumbnail_url || showMeta?.movie_thumbnail_url || '';
  const poster = posterPath ? assetUrl(posterPath) : '';
  const backdrop = poster;

  const schedule = (() => {
    const now = Date.now();
    const list = (Array.isArray(movieShows) ? movieShows : [])
      .filter((item) => item?.starts_at && new Date(item.starts_at).getTime() >= now)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    if (show?.starts_at && !list.some((item) => item.id === show.id)) {
      list.push({ ...show, id: show.id || showId });
    }
    return list;
  })();

  const dateOptions = (() => {
    const map = new Map();
    schedule.forEach((item) => {
      const key = dateKey(item.starts_at);
      if (key && !map.has(key)) map.set(key, { key, label: shortDate(item.starts_at), short: new Date(item.starts_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), showId: item.id });
    });
    return [...map.values()].slice(0, 6);
  })();

  const currentDateKey = dateKey(show?.starts_at);
  const timeOptions = schedule.filter((item) => dateKey(item.starts_at) === currentDateKey).slice(0, 6);

  const stepBar = (
    <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.16em]">
      <button
        type="button"
        onClick={() => setStep('seats')}
        className={step === 'seats' ? 'border-b-2 border-[#C8FF1F] pb-2 text-[#C8FF1F]' : 'pb-2 text-[#B5AFA6]/60 hover:text-[#F2F0EB]'}
      >
        Choose your place
      </button>
      <span aria-hidden="true" className="pb-2 text-[#B5AFA6]/45">→</span>
      <button
        type="button"
        disabled={!activeHold}
        onClick={() => setStep('payment')}
        className={step === 'payment' ? 'border-b-2 border-[#C8FF1F] pb-2 text-[#C8FF1F]' : 'pb-2 text-[#B5AFA6]/60 hover:text-[#F2F0EB] disabled:opacity-40'}
      >
        Payment
      </button>
      <span aria-hidden="true" className="pb-2 text-[#B5AFA6]/45">→</span>
      <button
        type="button"
        disabled={!activeBooking}
        onClick={() => setStep('ticket')}
        className={step === 'ticket' ? 'border-b-2 border-[#C8FF1F] pb-2 text-[#C8FF1F]' : 'pb-2 text-[#B5AFA6]/60 hover:text-[#F2F0EB] disabled:opacity-40'}
      >
        Ticket
      </button>
    </div>
  );

  const titleBlock = (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#C8FF1F]">{locality}</p>
      <h1 className="mt-1 font-editorial text-3xl font-semibold leading-none tracking-tight text-[#F2F0EB] sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 text-xs text-[#B5AFA6]">
        {[movie?.language, movie?.genre, movie?.certification].filter(Boolean).join(' · ') || 'Cinema'}
      </p>
      {dateOptions.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#B5AFA6]">Date</span>
          <div className="flex items-center gap-1 rounded-xl border border-[#B5AFA6]/20 bg-[#252A30] p-1">
            {dateOptions.map((day) => (
              <Link
                key={day.key}
                to={`/shows/${day.showId}/seats`}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  day.key === currentDateKey
                    ? 'bg-[#C8FF1F] font-semibold text-[#1E2227]'
                    : 'text-[#B5AFA6] hover:text-[#F2F0EB]'
                }`}
              >
                {day.short}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const selectionPanel = (
    <>
      <div className="space-y-0">
        {selectedSeats.length === 0 && (
          <p className="py-3 text-xs leading-relaxed text-[#B5AFA6]">
            Pick your seats on the map. Each seat is held for eight minutes.
          </p>
        )}
        {selectedSeats.map((seat) => (
          <div
            key={seat.seat_id}
            className="flex items-center justify-between gap-3 border-b border-[#B5AFA6]/10 py-2.5 text-xs"
          >
            <span className="text-[#B5AFA6]">Row {seat.row_label}</span>
            <span className="font-mono text-[#F2F0EB]">Seat {seat.seat_number}</span>
            <span className="font-mono text-[#C8FF1F]">{rupees(seat.price_minor || 0)}</span>
            <button
              type="button"
              onClick={() => toggle(seat)}
              aria-label={`Remove seat ${seat.row_label}-${seat.seat_number}`}
              className="text-[#B5AFA6] transition-colors hover:text-[#C8FF1F]"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-[#B5AFA6]/20 pt-3">
        <span className="text-[11px] uppercase tracking-[0.14em] text-[#B5AFA6]">Total</span>
        <span className="font-mono text-xl font-bold text-[#F2F0EB]">{rupees(totalMinor)}</span>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => navigate('/movies')}
          className="flex-1 rounded-md border border-[#C8FF1F] px-3 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#C8FF1F] transition-colors hover:bg-[#C8FF1F] hover:text-[#1E2227]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={hold}
          disabled={!selected.length || holding}
          className="flex-1 rounded-md bg-[#C8FF1F] px-3 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#1E2227] transition-colors hover:bg-[#D9FF66] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {holding ? 'Holding…' : 'Next'}
        </button>
      </div>
    </>
  );

  return (
    <div ref={layoutRef} className={`seat-booking-page flex min-h-0 flex-col bg-[#1E2227] text-[#F2F0EB] ${step === 'seats' ? 'lg:h-[calc(100vh-92px)] lg:overflow-hidden' : ''} ${selectionOpen && step === 'seats' ? 'pb-[48vh] lg:pb-0' : ''}`}>
      <style>{STYLES}</style>
      {step === 'seats' && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_170px] gap-7 items-start lg:h-full lg:min-h-0">
          <aside className="order-3 hidden space-y-4 lg:order-1 lg:block lg:self-start" data-seat-enter>
            <div className="hidden w-24 sm:w-28 lg:block">
              {poster ? (
                <img
                  src={poster}
                  alt={`Poster for ${title}`}
                  className="aspect-[2/3] w-full rounded-md object-cover"
                />
              ) : (
                <div className="flex aspect-[2/3] w-full items-end rounded-md bg-[#252A30] p-3">
                  <span className="font-editorial text-base text-[#F2F0EB]">{title}</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#C8FF1F]">Your selection</p>
              <h2 className="font-editorial text-2xl font-semibold text-[#F2F0EB]">Seats</h2>
            </div>

            {selectionPanel}
          </aside>

          <main className="order-2 lg:order-2 min-w-0 flex min-h-0 flex-col lg:h-full" data-seat-enter>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              {titleBlock}
              <div className="shrink-0 xl:pt-1">{stepBar}</div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mx-auto mb-2 mt-10 w-[70%] max-w-[500px]">
              <div
                className="h-8 w-full bg-gradient-to-b from-[#e8e8e8] to-[#e8e8e8]/25"
                style={{ clipPath: 'polygon(11% 100%, 89% 100%, 100% 0, 0 0)' }}
                aria-hidden="true"
              />
              <p className="mt-1.5 text-center font-mono text-[9px] uppercase tracking-[0.3em] text-[#B5AFA6]">
                Screen
              </p>
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="mx-auto w-full px-1">
                {sections.length === 0 ? (
                  <p className="py-16 text-center text-sm text-[#B5AFA6]">
                    No seats are configured for this show yet.
                  </p>
                ) : (
                  sections.map((section) => (
                    <section key={section.name} className="mb-5">
                      <div className="mx-auto flex items-center gap-3">
                        <span className="kk-cat-line" />
                        <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-wider text-[#B5AFA6]">
                          <span className="text-[#F2F0EB]">{rupees(section.price)}</span> {section.name}
                        </span>
                        <span className="kk-cat-line" />
                      </div>

                      <div className="mt-2 flex flex-col gap-1.5">
                        {section.rows.map((row) => (
                          <div key={`${section.name}-${row.label}`} className="kk-seat-line flex w-full items-center justify-center gap-2">
                            <span className="hidden sm:block w-5 shrink-0 text-right font-mono text-[10px] text-[#B5AFA6]">
                              {row.label}
                            </span>
                            <div className="kk-seat-row" style={{ '--kk-cols': cols }}>
                              {row.seats.map((seat) => {
                                const isSelected = selected.includes(seat.seat_id);
                                const unavailable = seat.status !== 'available' && !isSelected;
                                const span = Math.max(1, Number(seat.col_span) || 1);

                                const palette = isSelected
                                  ? { background: '#C8FF1F', borderColor: '#C8FF1F', color: '#1E2227' }
                                  : unavailable
                                    ? { background: '#1A1D21', borderColor: 'rgba(181,175,166,.10)', color: 'rgba(181,175,166,.30)' }
                                    : { background: '#4A525C', borderColor: 'rgba(242,240,236,.38)', color: '#F7F5F0' };

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
                                    title={`${row.label}-${seat.seat_number} · ${section.name} · ${rupees(seat.price_minor || section.price)}`}
                                    className="kk-seat"
                                    style={{
                                      gridColumn: `${Number(seat.x) - minX + 1} / span ${span}`,
                                      width: span > 1 ? `calc(${100 / span}% - 2px)` : '100%',
                                      justifySelf: 'center',
                                      ...palette,
                                    }}
                                  >
                                    {seat.accessible ? <span aria-hidden="true">♿</span> : seat.seat_number}
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

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] font-mono uppercase tracking-wider text-[#B5AFA6]">
              <span className="inline-flex items-center gap-2">
                <i className="h-3 w-3 rounded-sm bg-[#4A525C]" /> Available
              </span>
              <span className="inline-flex items-center gap-2">
                <i className="h-3 w-3 rounded-sm bg-[#C8FF1F]" /> Selected
              </span>
              <span className="inline-flex items-center gap-2">
                <i className="h-3 w-3 rounded-sm bg-[#1A1D21]" /> Sold
              </span>
            </div>
            </div>
          </main>

          <aside className="order-1 space-y-6 lg:order-3 lg:self-start" data-seat-enter>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-6">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#B5AFA6]">Date</p>
                  <p className="mt-1 font-editorial text-3xl font-semibold leading-none text-[#F2F0EB]">
                    {dayNumber} <span className="font-mono text-[10px] uppercase tracking-[0.18em]">{monthLabel}</span>
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#B5AFA6]">Time</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(timeOptions.length ? timeOptions : [{ id: show.id, starts_at: show.starts_at }]).map((item) => (
                      <Link
                        key={item.id}
                        to={`/shows/${item.id}/seats`}
                        className={`rounded-md border px-2.5 py-1.5 font-mono text-[10px] ${
                          item.id === show.id
                            ? 'border-[#C8FF1F] bg-[#C8FF1F] font-semibold text-[#1E2227]'
                            : 'border-[#B5AFA6]/20 text-[#B5AFA6] hover:border-[#C8FF1F] hover:text-[#C8FF1F]'
                        }`}
                      >
                        {timeLabel(item.starts_at) || timeText}
                      </Link>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#B5AFA6]">Hall</p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-[#F2F0EB]">{showMeta?.auditorium_name || format}</p>
                  <p className="mt-1 text-[11px] text-[#B5AFA6]">{showMeta?.theatre_name || locality}</p>
                </div>
              </div>
              {poster && (
                <div className="h-40 w-28 shrink-0 overflow-hidden rounded-xl bg-[#16191D] lg:hidden">
                  <img src={poster} alt={title} className="h-full w-full object-cover" />
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {step !== 'seats' && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5" data-seat-enter>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            {titleBlock}
            <div className="shrink-0 xl:pt-1">{stepBar}</div>
          </div>
          <div className="mt-6">
            {step === 'payment' && activeHold && (
              <BookingPayment
                hold={activeHold}
                selectedSeats={selectedSeats}
                totalMinor={totalMinor}
                title={title}
                dateText={`${dayNumber} ${monthLabel}`}
                timeText={timeText}
                format={format}
                locality={locality}
                onBack={() => setStep('seats')}
                onPaid={({ reference, booking }) => {
                  setActiveBooking({ reference, booking });
                  setStep('ticket');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}
            {step === 'ticket' && activeBooking && (
              <BookingTicket
                reference={activeBooking.reference}
                initialBooking={activeBooking.booking}
                onDone={() => navigate('/')}
              />
            )}
          </div>
        </div>
      )}

      {selectionOpen && selectedSeats.length > 0 && step === 'seats' && (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] max-h-[46vh] overflow-y-auto rounded-t-[24px] border-t border-[#B5AFA6]/20 bg-[#252A30] px-4 pb-5 pt-3 shadow-[0_-20px_60px_rgba(0,0,0,0.55)] lg:hidden"
          role="dialog"
          aria-modal="false"
          aria-label="Your seat selection"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#B5AFA6]/30" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#C8FF1F]">Your selection</p>
              <h2 className="font-editorial text-xl font-semibold text-[#F2F0EB]">
                {selectedSeats.length} {selectedSeats.length === 1 ? 'seat' : 'seats'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSelectionOpen(false)}
              aria-label="Close selection"
              className="grid h-8 w-8 place-items-center rounded-full border border-[#B5AFA6]/20 text-[#B5AFA6] transition-colors hover:text-[#C8FF1F]"
            >
              ×
            </button>
          </div>
          <div className="mt-2 space-y-3">{selectionPanel}</div>
        </div>
      )}

      {notice && (
        <div
          className="fixed bottom-8 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-md bg-[#F2F0EB] px-4 py-2.5 text-center text-xs font-semibold text-[#16191D]"
          role="status"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
