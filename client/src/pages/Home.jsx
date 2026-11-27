import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { assetUrl } from '../services/api.js';
import { useRealtime } from '../services/realtime.js';
import { HeroHeader } from '../components/SiteChrome.jsx';

const rupees = (value) => `₹${Number(value).toLocaleString('en-IN')}`;

const formatFromAuditorium = (name = '') => {
  if (/dolby/i.test(name)) return 'Dolby Atmos';
  if (/laser/i.test(name)) return '2K Laser';
  return name || '2K Laser';
};

const dateKey = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const dateLabel = (value) => {
  const date = new Date(value);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const timeLabel = (value) => {
  const date = new Date(value);
  return date
    .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    .toLowerCase();
};

const minuteLabel = (minutes) => {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return '—';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h ? `${h}h` : '', m ? `${String(m).padStart(2, '0')}m` : ''].filter(Boolean).join(' ');
};

export default function Home() {
  const navigate = useNavigate();
  const [movies, setMovies] = useState([]);
  const [shows, setShows] = useState([]);
  const [community, setCommunity] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [heroIndex, setHeroIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [moviesResult, showsResult, communityResult] = await Promise.allSettled([
      api.get('/movies'),
      api.get('/shows'),
      api.get('/community'),
    ]);
    setMovies(
      moviesResult.status === 'fulfilled' && Array.isArray(moviesResult.value.data)
        ? moviesResult.value.data
        : [],
    );
    setShows(
      showsResult.status === 'fulfilled' && Array.isArray(showsResult.value.data) ? showsResult.value.data : [],
    );
    setCommunity(communityResult.status === 'fulfilled' ? communityResult.value.data : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(['catalog'], load);

  const films = useMemo(
    () => movies.filter((movie) => movie.thumbnail_url || movie.synopsis),
    [movies],
  );
  const filmIds = useMemo(() => new Set(films.map((movie) => String(movie.id))), [films]);

  const showtimes = useMemo(() => {
    const now = Date.now();
    return shows
      .filter(
        (show) =>
          show?.starts_at &&
          new Date(show.starts_at).getTime() >= now &&
          show.status !== 'cancelled' &&
          filmIds.has(String(show.movie_id)),
      )
      .map((show) => ({
        id: show.id,
        movieId: show.movie_id,
        startsAt: show.starts_at,
        date: dateKey(show.starts_at),
        dateLabel: dateLabel(show.starts_at),
        time: timeLabel(show.starts_at),
        format: formatFromAuditorium(show.auditorium_name),
        auditoriumName: [show.theatre_name, show.auditorium_name].filter(Boolean).join(' · '),
        price: show.price_min_minor ? Math.round(Number(show.price_min_minor) / 100) : 600,
      }))
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  }, [shows, filmIds]);

  const dates = useMemo(() => {
    const map = new Map();
    showtimes.forEach((show) => {
      if (!map.has(show.date)) map.set(show.date, show.dateLabel);
    });
    return [...map.entries()].slice(0, 4).map(([date, label]) => ({ date, label }));
  }, [showtimes]);

  useEffect(() => {
    if (selectedDate && !dates.some((day) => day.date === selectedDate)) setSelectedDate('');
  }, [dates, selectedDate]);

  const showForMovie = useCallback(
    (movieId) =>
      showtimes.filter(
        (show) => String(show.movieId) === String(movieId) && (!selectedDate || show.date === selectedDate),
      ),
    [showtimes, selectedDate],
  );

  const heroSlides = useMemo(() => {
    if (!films.length) return [];
    const heroImage = community?.hero?.[0]?.url || '';
    return films
      .map((movie) => ({
        movie,
        showsForMovie: showtimes.filter(
          (show) => String(show.movieId) === String(movie.id) && (!selectedDate || show.date === selectedDate),
        ),
      }))
      .filter((entry) => entry.showsForMovie.length > 0)
      .slice(0, 5)
      .map(({ movie, showsForMovie }, index) => {
        const show = showsForMovie[0];
        return {
          movie,
          show,
          kicker:
            index === 0
              ? 'Samudai Cineplex, Margao · Screen 1 · 2K Laser'
              : [movie.language, show?.format].filter(Boolean).join(' · '),
          backdrop: assetUrl(movie.thumbnail_url) || heroImage,
        };
      });
  }, [films, showtimes, selectedDate, community]);

  useEffect(() => {
    if (heroIndex >= heroSlides.length) setHeroIndex(0);
    else if (!heroSlides[heroIndex]?.show) {
      const firstWithShow = heroSlides.findIndex((slide) => slide.show);
      if (firstWithShow >= 0) setHeroIndex(firstWithShow);
    }
  }, [heroSlides.length, heroIndex, heroSlides]);

  const activeHero = heroSlides[heroIndex] || heroSlides[0];
  const spotlightCards = films.flatMap((movie) =>
    showForMovie(movie.id).map((show) => ({ movie, show })),
  );

  function openMovieShow(movie) {
    const showsForMovie = showForMovie(movie.id);
    if (showsForMovie[0]) navigate(`/shows/${showsForMovie[0].id}/seats`);
    else navigate('/movies');
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-16 space-y-16" role="status" aria-label="Loading films">
        <span className="sr-only">Loading films</span>
        <section className="space-y-5 animate-pulse">
          <div className="relative pb-5">
            <div className="relative rounded-[28px] bg-[#16191D] min-h-[340px] sm:min-h-[380px] lg:min-h-[395px] flex flex-col justify-between overflow-hidden">
              <HeroHeader active="movies" />
              <div className="relative z-10 space-y-3 px-5 sm:px-8 pb-9 pt-8">
                <div className="h-3 w-36 rounded bg-[#2A3037]" />
                <div className="h-10 w-80 max-w-full rounded bg-[#2A3037]" />
                <div className="h-3 w-[28rem] max-w-full rounded bg-[#252A30]" />
                <div className="flex flex-wrap gap-3 pt-1">
                  <div className="h-10 w-48 rounded-xl bg-[#2A3037]" />
                  <div className="h-10 w-36 rounded-xl bg-[#252A30]" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="h-3 w-28 rounded bg-[#252A30]" />
            <div className="h-10 w-64 rounded-xl bg-[#252A30]" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="relative flex aspect-[3/3.45] flex-col justify-between rounded-[22px] bg-[#252A30] p-3">
                <div className="h-6 w-16 rounded-full bg-[#2A3037]" />
                <div className="space-y-2">
                  <div className="h-6 w-24 rounded-full bg-[#2A3037]" />
                  <div className="h-9 w-full rounded-xl bg-[#B5AFA6]/30" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-16 space-y-16">
      <section className="space-y-5">
        <div className="relative pb-5">
          <div className="relative rounded-[28px] bg-[#16191D] text-[#F2F0EB] overflow-hidden min-h-[340px] sm:min-h-[380px] lg:min-h-[395px] flex flex-col justify-between">
            {activeHero?.backdrop && (
              <img
                src={activeHero.backdrop}
                alt={activeHero.movie.title}
                className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-500"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-[#16191D]/95 via-[#1E2227]/72 to-[#1E2227]/35" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#16191D]/92 via-transparent to-[#16191D]/65" />

            <HeroHeader active="movies" />

            <div className="relative z-10 flex items-end justify-between gap-6 px-5 sm:px-8 pb-8 sm:pb-9 pt-8">
              <div className="max-w-xl space-y-3">
                <p className="text-xs font-semibold tracking-wide text-[#C8FF1F]">{activeHero?.kicker}</p>
                <h1 className="font-editorial text-3xl sm:text-[42px] font-semibold tracking-tight text-[#F2F0EB] leading-[1.08]">
                  {activeHero?.movie.title || 'All films and showtimes'}
                </h1>
                <p className="text-sm text-[#B5AFA6] leading-relaxed max-w-lg">
                  {activeHero
                    ? `${activeHero.movie.language || 'Cinema'} · ${activeHero.movie.genre || 'Drama'} · ${
                        activeHero.movie.certification || 'UA'
                      } · ${minuteLabel(activeHero.movie.duration_minutes)}. ${
                        activeHero.show ? `Next show at ${activeHero.show.time}.` : 'Showtimes at the box office.'
                      }`
                    : 'Films at the Samudai Cineplex, Margao.'}
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => activeHero?.show && navigate(`/shows/${activeHero.show.id}/seats`)}
                    disabled={!activeHero?.show}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#C8FF1F] text-[#1E2227] hover:bg-[#B5AFA6] transition-colors disabled:opacity-50"
                  >
                    Choose seats · from {rupees(activeHero?.show?.price || 600)}
                  </button>
                  <button
                    type="button"
                    onClick={() => document.getElementById('movies-now')?.scrollIntoView({ behavior: 'smooth' })}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium bg-[#1E2227]/75 backdrop-blur-md text-[#F2F0EB] border border-[#B5AFA6]/30 hover:border-[#C8FF1F] hover:text-[#C8FF1F] transition-colors"
                  >
                    All showtimes
                  </button>
                </div>
              </div>

              <div className="hidden sm:flex flex-col items-center gap-2 pb-10 shrink-0">
                {heroSlides.map((item, index) => (
                  <button
                    key={item.movie.id}
                    type="button"
                    onClick={() => setHeroIndex(index)}
                    aria-label={item.movie.title}
                    className={`w-3.5 rounded-full transition-all duration-200 ${
                      index === heroIndex
                        ? 'h-8 bg-[#C8FF1F]'
                        : 'h-5 bg-[#1E2227]/60 border border-[#B5AFA6]/45 hover:border-[#C8FF1F]'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <svg
            viewBox="0 0 160 46"
            className="pointer-events-none absolute bottom-[18px] left-1/2 -translate-x-1/2 w-[156px] h-[46px] z-20"
            aria-hidden="true"
          >
            <path d="M 0 46 C 28 46, 38 4, 80 4 C 122 4, 132 46, 160 46 Z" fill="#1E2227" />
          </svg>
          <button
            type="button"
            onClick={() => document.getElementById('movies-now')?.scrollIntoView({ behavior: 'smooth' })}
            aria-label="Scroll to schedule"
            className="absolute bottom-0 left-1/2 -translate-x-1/2 z-30 w-14 h-14 rounded-full bg-[#252A30] hover:bg-[#C8FF1F] text-[#F2F0EB] hover:text-[#1E2227] shadow-md flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </button>

          <div className="absolute bottom-[30px] right-4 z-30 hidden sm:block">
            <svg
              viewBox="0 0 300 72"
              preserveAspectRatio="none"
              className="pointer-events-none absolute -top-[14px] h-[72px]"
              style={{ left: '-16%', width: '132%', maxWidth: 'none' }}
              aria-hidden="true"
            >
              <path
                d="M0 72 C10 72, 14 8, 24 8 L300 8 L300 72 Z"
                fill="#1E2227"
              />
            </svg>
            <div className="relative z-10 flex items-center gap-1 rounded-xl border border-[#B5AFA6]/20 bg-[#252A30] p-1">
            {dates.length ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedDate('')}
                  className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                    selectedDate === ''
                      ? 'bg-[#C8FF1F] text-[#1E2227] font-semibold'
                      : 'text-[#B5AFA6] hover:text-[#F2F0EB]'
                  }`}
                >
                  All
                </button>
                {dates.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setSelectedDate(day.date)}
                    className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                      selectedDate === day.date
                        ? 'bg-[#C8FF1F] text-[#1E2227] font-semibold'
                        : 'text-[#B5AFA6] hover:text-[#F2F0EB]'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </>
            ) : (
              <span className="px-4 py-2 text-xs text-[#B5AFA6]">Dates at the box office</span>
            )}
          </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 sm:hidden">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#B5AFA6]">Choose a date</p>
          <div className="flex items-center gap-1 p-1 bg-[#252A30] border border-[#B5AFA6]/20 rounded-xl">
            {dates.length ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedDate('')}
                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                    selectedDate === ''
                      ? 'bg-[#C8FF1F] text-[#1E2227] font-semibold'
                      : 'text-[#B5AFA6] hover:text-[#F2F0EB]'
                  }`}
                >
                  All
                </button>
                {dates.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setSelectedDate(day.date)}
                    className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                      selectedDate === day.date
                        ? 'bg-[#C8FF1F] text-[#1E2227] font-semibold'
                        : 'text-[#B5AFA6] hover:text-[#F2F0EB]'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </>
            ) : (
              <span className="px-4 py-2 text-xs text-[#B5AFA6]">Dates at the box office</span>
            )}
          </div>
        </div>

        <div id="movies-now" className="space-y-5 pt-2">

        {spotlightCards.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {spotlightCards.map(({ movie, show }) => (
              <button
                key={`${movie.id}-${show.id}`}
                type="button"
                onClick={() => navigate(`/shows/${show.id}/seats`)}
                className="group relative rounded-[22px] overflow-hidden bg-[#252A30] aspect-[3/3.45] flex flex-col justify-between p-3 text-left shadow-sm"
              >
                {movie.thumbnail_url && (
                  <img
                    src={assetUrl(movie.thumbnail_url)}
                    alt={movie.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#16191D]/95 via-[#1E2227]/30 to-[#16191D]/45" />
                <div className="relative z-10">
                  <span className="px-2.5 py-1 rounded-full bg-[#B5AFA6] text-[#1E2227] font-mono text-[11px] font-bold tabular-nums">
                    {show.time}
                  </span>
                </div>
                <div className="relative z-10 space-y-2">
                  <span className="inline-block px-2.5 py-1 rounded-full bg-[#1E2227]/85 border border-[#B5AFA6]/20 text-[#B5AFA6] font-mono text-[11px] font-medium tabular-nums">
                    from {rupees(show.price || 600)}
                  </span>
                  <div className="w-full rounded-xl bg-[#B5AFA6] group-hover:bg-[#C8FF1F] text-[#1E2227] px-3 py-2 flex items-center justify-between gap-2 transition-colors">
                    <span className="text-xs font-semibold truncate">{movie.title}</span>
                    <span>→</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-[22px] bg-[#252A30] px-6 py-14 text-center">
            <p className="font-editorial text-xl font-semibold text-[#F2F0EB]">No screenings on this date</p>
            <p className="mt-1 text-xs text-[#B5AFA6]">Choose another date to see what is playing.</p>
          </div>
        )}
        </div>
      </section>

    </div>
  );
}
