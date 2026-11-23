import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { assetUrl } from '../services/api.js';

const C = {
  ink: '#1E2227',
  tide: '#262C33',
  shell: '#F2F0EC',
  kokum: '#C8FF1F',
  mango: '#C8FF1F',
  green: '#B6E36A',
  muted: '#B5AFA6',
};

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const TIME_FILTERS = [
  { key: 'all', label: 'All shows' },
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
  { key: 'night', label: 'Night' },
];

const STYLES = `
.kk-md { font-family: 'Public Sans', system-ui, sans-serif; }
.kk-display { font-family: 'Fraunces', Georgia, serif; }

.kk-date { transition: background-color .18s ease, color .18s ease, border-color .18s ease, transform .18s ease, box-shadow .18s ease; }
.kk-date:not(:disabled):hover { background-color: rgba(242,240,236, .07); }
.kk-date.is-active { background-color: #C8FF1F; border-color: #C8FF1F; color: #fff; box-shadow: 0 10px 26px rgba(200,255,31, .3); }

.kk-time { transition: background-color .18s ease, border-color .18s ease, transform .18s ease, box-shadow .18s ease; }
.kk-time:not(.is-disabled):hover { transform: translateY(-2px); background-color: rgba(242,240,236, .08); box-shadow: 0 10px 22px rgba(0, 0, 0, .22); }

.kk-filter { transition: background-color .18s ease, color .18s ease, border-color .18s ease; }
.kk-filter:not(.is-active):hover { background-color: rgba(242,240,236, .07); }

.kk-reveal { animation: kk-fade-up .5s ease both; }
@keyframes kk-fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .kk-date, .kk-time, .kk-filter { transition: none !important; }
  .kk-reveal { animation: none !important; }
}
`;

const pad2 = (n) => String(n).padStart(2, '0');

function startOfDay(value) {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateKey(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function timeLabel(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function prettyDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Date unavailable';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function runtimeLabel(minutes) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return '';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
}

function timeBucket(value) {
  const hour = new Date(value).getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function showState(show) {
  const total = Number(show.seat_count) || 0;
  const booked = Number(show.booked_count) || 0;
  const held = Number(show.held_count) || 0;
  const status = String(show.status || '').toLowerCase();
  if (['cancelled', 'completed', 'closed'].includes(status)) return 'sold';
  if (total > 0 && booked >= total) return 'sold';
  if (total > 0 && (booked + held) / total >= 0.55) return 'fast';
  return 'open';
}

function Showtime({ show }) {
  const state = showState(show);
  const color = state === 'open' ? C.green : state === 'fast' ? C.mango : C.muted;
  const disabled = state === 'sold';

  const body = (
    <>
      <span className="block text-[13px] font-semibold leading-tight">{timeLabel(show.starts_at)}</span>
      <span className="mt-0.5 block whitespace-nowrap text-[9px] font-semibold uppercase tracking-[.12em] opacity-70">
        {show.auditorium_name || 'Standard'}
      </span>
    </>
  );

  if (disabled) {
    return (
      <span
        className="kk-time is-disabled inline-flex min-w-[118px] flex-col items-center rounded-md border px-3 py-2 opacity-40"
        style={{ borderColor: `${color}55`, color }}
        title="Sold out"
      >
        {body}
      </span>
    );
  }

  return (
    <Link
      to={`/shows/${show.id}/seats`}
      className="kk-time inline-flex min-w-[118px] flex-col items-center rounded-md border px-3 py-2"
      style={{ borderColor: `${color}99`, color }}
      title={`${state === 'fast' ? 'Fast filling · ' : ''}${show.auditorium_name || 'Standard'}`}
    >
      {body}
    </Link>
  );
}

export default function MovieDetails() {
  const { id } = useParams();
  const [movie, setMovie] = useState(null);
  const [shows, setShows] = useState([]);
  const [movieLoading, setMovieLoading] = useState(true);
  const [showsLoading, setShowsLoading] = useState(false);
  const [movieError, setMovieError] = useState(false);
  const [showsError, setShowsError] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [timeFilter, setTimeFilter] = useState('all');
  const pickedDateRef = useRef(false);

  useEffect(() => {
    let active = true;

    setMovie(null);
    setShows([]);
    setMovieLoading(true);
    setMovieError(false);
    setShowsError(false);
    setSelectedDate(null);
    setTimeFilter('all');
    pickedDateRef.current = false;

    api.get(`/movies/${id}`)
      .then((r) => {
        if (active) setMovie(r.data);
      })
      .catch((error) => {
        console.error(error);
        if (active) setMovieError(true);
      })
      .finally(() => {
        if (active) setMovieLoading(false);
      });

    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!movie) return undefined;

    let active = true;
    setShowsLoading(true);
    setShowsError(false);

    api.get('/shows', { params: { movieId: movie.id } })
      .then((r) => {
        if (active) setShows(Array.isArray(r.data) ? r.data : []);
      })
      .catch((error) => {
        console.error(error);
        if (active) setShowsError(true);
      })
      .finally(() => {
        if (active) setShowsLoading(false);
      });

    return () => { active = false; };
  }, [movie]);

  const dateOptions = useMemo(() => {
    const withShows = new Map();
    for (const show of shows) {
      const d = new Date(show.starts_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = dateKey(d);
      if (!withShows.has(key)) withShows.set(key, { key, date: startOfDay(d), count: 0 });
      withShows.get(key).count += 1;
    }

    const days = new Map();
    const today = startOfDay(new Date());
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const key = dateKey(d);
      const found = withShows.get(key);
      days.set(key, { key, date: d, count: found?.count || 0, hasShows: Boolean(found) });
    }
    // Keep any screening that falls outside the current week visible too.
    for (const [key, value] of withShows) {
      if (!days.has(key)) days.set(key, { ...value, hasShows: true });
    }
    return [...days.values()].sort((a, b) => a.date - b.date);
  }, [shows]);

  useEffect(() => {
    if (!dateOptions.length) return;
    if (pickedDateRef.current && dateOptions.some((d) => d.key === selectedDate)) return;
    const first = dateOptions.find((d) => d.hasShows) || dateOptions[0];
    setSelectedDate(first.key);
  }, [dateOptions, selectedDate]);

  const dayShows = useMemo(
    () => shows.filter((show) => selectedDate && dateKey(show.starts_at) === selectedDate),
    [shows, selectedDate]
  );

  const filterCounts = useMemo(() => {
    const counts = { all: dayShows.length, morning: 0, afternoon: 0, evening: 0, night: 0 };
    for (const show of dayShows) counts[timeBucket(show.starts_at)] += 1;
    return counts;
  }, [dayShows]);

  const filteredShows = useMemo(
    () => (timeFilter === 'all'
      ? dayShows
      : dayShows.filter((show) => timeBucket(show.starts_at) === timeFilter)),
    [dayShows, timeFilter]
  );

  const theatres = useMemo(() => {
    const map = new Map();
    for (const show of filteredShows) {
      const key = show.theatre_name || 'Cinema';
      if (!map.has(key)) {
        map.set(key, { key, name: key, auditoriums: new Set(), shows: [] });
      }
      const group = map.get(key);
      if (show.auditorium_name) group.auditoriums.add(show.auditorium_name);
      group.shows.push(show);
    }
    return [...map.values()]
      .map((group) => ({
        ...group,
        auditoriums: [...group.auditoriums],
        shows: [...group.shows].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredShows]);

  const genres = useMemo(() => {
    const raw = movie?.genre;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean);
    return String(raw).split(/[,/|]/).map((g) => g.trim()).filter(Boolean);
  }, [movie]);

  if (movieLoading) {
    return (
      <div className="kk-md flex min-h-screen items-center justify-center bg-[#1E2227] px-4 text-[#F2F0EC]">
        <style>{STYLES}</style>
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto h-16 w-16 animate-pulse rounded-2xl bg-[#262C33]" />
          <p className="kk-display mt-5 text-xl font-bold">Preparing your screening...</p>
          <p className="mt-2 text-sm text-[#F2F0EC]/55">A little movie magic is on its way.</p>
        </div>
      </div>
    );
  }

  if (movieError || !movie) {
    return (
      <div className="kk-md flex min-h-screen flex-col items-center justify-center bg-[#1E2227] px-5 text-center text-[#F2F0EC]">
        <style>{STYLES}</style>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[#C8FF1F]">404 · Film unavailable</p>
        <h1 className="kk-display mt-3 text-3xl font-bold">We couldn't find this film.</h1>
        <p className="mt-3 max-w-md text-sm text-[#F2F0EC]/65">
          It may have been removed or the link may be incorrect.
        </p>
        <Link to="/movies" className="mt-6 rounded-xl bg-[#C8FF1F] px-5 py-3 text-sm font-bold text-white">
          Back to movies
        </Link>
      </div>
    );
  }

  const posterPath = movie.thumbnail_url
    || (Array.isArray(movie.media) ? movie.media.find((item) => item.media_type === 'poster')?.url : '')
    || '';
  const poster = assetUrl(posterPath);
  const activeDate = dateOptions.find((d) => d.key === selectedDate);
  const totalShows = shows.length;

  return (
    <div className="kk-md min-h-screen bg-[#1E2227] text-[#F2F0EC]">
      <style>{STYLES}</style>

      {/* Movie header */}
      <section className="relative overflow-hidden border-b border-[#F2F0EC]/10">
        {poster && (
          <img
            src={poster}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-3xl"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#1E2227]/70 via-[#1E2227]/90 to-[#1E2227]" />

        <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-6 sm:px-6">
          <Link
            to="/movies"
            className="inline-flex items-center gap-2 rounded-full border border-[#F2F0EC]/15 bg-[#1E2227]/40 px-4 py-2 text-xs font-semibold text-[#F2F0EC]/75 backdrop-blur transition hover:border-[#C8FF1F]/60 hover:text-[#C8FF1F]"
          >
            <span aria-hidden="true">←</span> All movies
          </Link>

          <div className="mt-6 flex flex-col gap-5 sm:mt-8 sm:flex-row sm:items-end sm:gap-7">
            <div className="relative w-28 shrink-0 sm:w-36">
              {poster ? (
                <img
                  src={poster}
                  alt={`Poster for ${movie.title}`}
                  className="aspect-[3/4] w-full rounded-xl object-cover shadow-2xl shadow-black/50 ring-1 ring-white/10"
                />
              ) : (
                <div className="flex aspect-[3/4] w-full items-center justify-center rounded-xl bg-[#262C33] p-3 text-center text-[10px] font-bold uppercase tracking-widest text-[#F2F0EC]/70">
                  Konkani Cinema
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="kk-display text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                {movie.title}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {runtimeLabel(movie.duration_minutes) && (
                  <span className="rounded-full border border-[#F2F0EC]/20 px-3 py-1 text-xs font-medium text-[#F2F0EC]/75">
                    Movie runtime: {runtimeLabel(movie.duration_minutes)}
                  </span>
                )}
                <span className="rounded border border-[#F2F0EC]/30 px-2 py-0.5 text-xs font-bold text-[#F2F0EC]/85">
                  {movie.certification || 'UA'}
                </span>
                {movie.language && (
                  <span className="rounded-full border border-[#F2F0EC]/20 px-3 py-1 text-xs font-medium text-[#F2F0EC]/75">
                    {movie.language}
                  </span>
                )}
                {genres.map((genre) => (
                  <span
                    key={genre}
                    className="rounded-full border border-[#F2F0EC]/15 px-3 py-1 text-xs font-medium text-[#F2F0EC]/60"
                  >
                    {genre}
                  </span>
                ))}
              </div>

              {movie.synopsis && (
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[#F2F0EC]/70">
                  {movie.synopsis}
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <a
                  href="#showtimes"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#C8FF1F] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-black/20 transition hover:bg-[#A8D819]"
                >
                  Book tickets <span aria-hidden="true">↓</span>
                </a>
                <span className="text-xs text-[#F2F0EC]/50">
                  {totalShows > 0
                    ? `${totalShows} ${totalShows === 1 ? 'show' : 'shows'} scheduled`
                    : 'Showtimes will appear here'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Date + filters */}
      <div className="sticky top-[72px] z-30 border-b border-[#F2F0EC]/10 bg-[#1E2227]/95 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center gap-3 overflow-x-auto py-2.5">
            <div className="flex shrink-0 items-stretch gap-1">
              {dateOptions.map((day) => {
                const active = day.key === selectedDate;
                return (
                  <button
                    key={day.key}
                    type="button"
                    disabled={!day.hasShows}
                    onClick={() => {
                      pickedDateRef.current = true;
                      setSelectedDate(day.key);
                    }}
                    aria-pressed={active}
                    className={`kk-date flex min-w-[62px] shrink-0 flex-col items-center rounded-lg border px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-35 ${active ? 'is-active' : ''}`}
                    style={{ borderColor: active ? C.kokum : 'rgba(242,240,236,.14)' }}
                  >
                    <span className="text-[9px] font-bold uppercase tracking-[.12em] opacity-70">
                      {WEEKDAYS[day.date.getDay()]}
                    </span>
                    <span className="kk-display text-lg font-bold leading-tight">{day.date.getDate()}</span>
                    <span className="text-[9px] font-bold uppercase tracking-[.12em] opacity-70">
                      {MONTHS[day.date.getMonth()]}
                    </span>
                  </button>
                );
              })}
            </div>

            <span className="mx-1 h-8 w-px shrink-0 bg-[#F2F0EC]/[0.12]" aria-hidden="true" />

            <div className="flex shrink-0 items-center gap-1">
              {TIME_FILTERS.map((filter) => {
                const active = filter.key === timeFilter;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setTimeFilter(filter.key)}
                    aria-pressed={active}
                    className={`kk-filter shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                      active
                        ? 'is-active bg-[#F2F0EC] text-[#1E2227]'
                        : 'border border-[#F2F0EC]/15 text-[#F2F0EC]/65'
                    }`}
                  >
                    {filter.label}
                    <span className={`ml-1.5 text-[10px] ${active ? 'text-[#1E2227]/60' : 'text-[#F2F0EC]/40'}`}>
                      {filterCounts[filter.key]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[#F2F0EC]/45">
            <span>
              {activeDate ? `${prettyDate(activeDate.date)} · ${filteredShows.length} ${filteredShows.length === 1 ? 'show' : 'shows'}` : 'No date selected'}
            </span>
            <span className="hidden items-center gap-4 sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-full" style={{ background: C.green }} /> Available
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-full" style={{ background: C.mango }} /> Fast filling
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Theatres */}
      <main id="showtimes" className="mx-auto max-w-6xl px-4 pb-20 pt-7 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-[#C8FF1F]">Select your screening</p>
            <h2 className="kk-display mt-1.5 text-2xl font-bold sm:text-3xl">
              Showtimes<span className="text-[#C8FF1F]">.</span>
            </h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#F2F0EC]/15 bg-[#262C33] px-4 py-2 text-xs font-semibold text-[#F2F0EC]/75">
            <span className="h-2 w-2 rounded-full bg-[#C8FF1F]" />
            {showsLoading ? 'Loading screenings...' : `${theatres.length} ${theatres.length === 1 ? 'cinema' : 'cinemas'}`}
          </span>
        </div>

        {showsError ? (
          <div className="rounded-2xl border border-[#C8FF1F]/40 bg-[#262C33] p-6">
            <h3 className="kk-display text-xl font-bold">Showtimes couldn't load.</h3>
            <p className="mt-2 text-sm text-[#F2F0EC]/65">Please check your connection and try again.</p>
            <button
              type="button"
              onClick={() => {
                setShowsError(false);
                setShowsLoading(true);
                api.get('/shows', { params: { movieId: movie.id } })
                  .then((r) => setShows(Array.isArray(r.data) ? r.data : []))
                  .catch((e) => {
                    console.error(e);
                    setShowsError(true);
                  })
                  .finally(() => setShowsLoading(false));
              }}
              className="mt-4 rounded-lg bg-[#C8FF1F] px-4 py-2 text-sm font-bold text-white"
            >
              Try again
            </button>
          </div>
        ) : showsLoading && shows.length === 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[1, 2].map((n) => (
              <div key={n} className="h-44 animate-pulse rounded-2xl bg-[#262C33]" />
            ))}
          </div>
        ) : theatres.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {theatres.map((theatre, index) => (
              <article
                key={theatre.key}
                className="kk-reveal rounded-2xl border border-[#F2F0EC]/[0.12] bg-[#262C33]/85 p-5 shadow-lg shadow-black/10 sm:p-6"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold sm:text-lg">{theatre.name}</h3>
                    <p className="mt-1 truncate text-xs text-[#F2F0EC]/50">
                      {theatre.auditoriums.join(' · ') || 'Screening room'}
                    </p>
                    <p className="mt-1.5 text-[11px] font-semibold text-[#B6E36A]">Cancellation available</p>
                  </div>
                  <span className="material-symbols-outlined shrink-0 text-[#F2F0EC]/35" aria-hidden="true">
                    favorite_border
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {theatre.shows.map((show) => (
                    <Showtime key={show.id} show={show} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#F2F0EC]/20 bg-[#262C33]/50 px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1E2227] text-[#C8FF1F]">
              <span className="material-symbols-outlined">event_busy</span>
            </div>
            <h3 className="kk-display mt-4 text-2xl font-bold">No shows here yet.</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#F2F0EC]/60">
              {timeFilter !== 'all'
                ? 'No screenings match this time of day. Try another filter or date.'
                : 'There are no screenings for this date. Pick another date above.'}
            </p>
            {timeFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setTimeFilter('all')}
                className="mt-5 rounded-lg border border-[#C8FF1F]/40 px-4 py-2 text-sm font-semibold text-[#C8FF1F] transition hover:bg-[#C8FF1F] hover:text-[#1E2227]"
              >
                Show all times
              </button>
            )}
          </div>
        )}

        {/* About */}
        <section className="mt-12 border-t border-[#F2F0EC]/15 pt-8">
          <h2 className="kk-display text-2xl font-bold">About the movie</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#F2F0EC]/65">
            {movie.synopsis || 'The story awaits. More details coming soon.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-[#F2F0EC]/55">
            {runtimeLabel(movie.duration_minutes) && <span>Runtime {runtimeLabel(movie.duration_minutes)}</span>}
            {movie.language && <span>· {movie.language}</span>}
            {movie.certification && <span>· {movie.certification}</span>}
            {genres.length > 0 && <span>· {genres.join(', ')}</span>}
          </div>
        </section>
      </main>

      <footer className="border-t border-[#F2F0EC]/10 bg-[#171B1F]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-[#F2F0EC]/50 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="kk-display text-base font-bold text-[#F2F0EC]">
            Konkani Samudai<span className="text-[#C8FF1F]">.</span>
          </span>
          <Link to="/movies" className="transition hover:text-[#C8FF1F]">Back to all movies ↑</Link>
        </div>
      </footer>
    </div>
  );
}
