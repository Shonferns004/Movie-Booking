import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import api, { session } from '../services/api.js';

const MOVIE_ICON = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="2.18" />
    <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" />
  </svg>
);

const TICKET_ICON = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <path d="M13 5v2M13 17v2M13 11v2" />
  </svg>
);

const USER_ICON = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const CLOSE_ICON = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

function useTicketCount(pathname) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!localStorage.getItem('token')) {
      setCount(0);
      return undefined;
    }
    let alive = true;
    Promise.all([
      api.get('/bookings/me/tickets').catch(() => ({ data: [] })),
      api.get('/community/events/tickets/me').catch(() => ({ data: [] })),
    ]).then(([bookings, passes]) => {
      if (!alive) return;
      const total =
        (Array.isArray(bookings.data) ? bookings.data.length : 0) +
        (Array.isArray(passes.data) ? passes.data.length : 0);
      setCount(total);
    });
    return () => {
      alive = false;
    };
  }, [pathname]);
  return count;
}

function AccountButton({ tone = 'dark' }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [token] = useState(() => Boolean(localStorage.getItem('token')));
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!token) {
    return (
      <Link
        to="/login"
        title="Sign in"
        className="w-10 h-10 rounded-full bg-[#1E2227]/85 backdrop-blur-md border border-[#B5AFA6]/25 text-[#F2F0EB] hover:bg-[#C8FF1F] hover:text-[#1E2227] inline-flex items-center justify-center transition-colors"
      >
        {USER_ICON}
      </Link>
    );
  }

  function signOut() {
    session.logout();
    setOpen(false);
    navigate('/');
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Account menu"
        aria-expanded={open}
        className={`w-10 h-10 rounded-full ${
          tone === 'light'
            ? 'bg-[#C8FF1F] text-[#1E2227] border border-[#C8FF1F]'
            : 'bg-[#1E2227]/85 border border-[#B5AFA6]/25 text-[#F2F0EB] hover:bg-[#C8FF1F] hover:text-[#1E2227]'
        } backdrop-blur-md inline-flex items-center justify-center transition-colors`}
      >
        {USER_ICON}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-[80] w-56 overflow-hidden rounded-2xl border border-[#B5AFA6]/20 bg-[#252A30] text-[#F2F0EB] shadow-2xl">
          <Link to="/my-tickets" onClick={() => setOpen(false)} className="block px-4 py-3 text-xs font-medium hover:bg-[#1E2227]">
            My tickets
          </Link>
          <Link to="/#join" onClick={() => setOpen(false)} className="block px-4 py-3 text-xs font-medium hover:bg-[#1E2227]">
            Membership
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="block w-full px-4 py-3 text-left text-xs font-medium text-[#F08A80] hover:bg-[#1E2227]"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function HeroHeader({ active = 'house' }) {
  const { pathname } = useLocation();
  const count = useTicketCount(pathname);
  return (
    <div className="relative z-10 flex items-center justify-between gap-4 px-5 sm:px-7 pt-5 sm:pt-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex items-center bg-[#1E2227]/85 backdrop-blur-md border border-[#B5AFA6]/25 rounded-full p-1">
          <Link
            to="/"
            className={`px-4 py-1.5 rounded-full text-xs transition-colors ${
              active === 'house'
                ? 'font-semibold bg-[#C8FF1F] text-[#1E2227]'
                : 'font-medium text-[#B5AFA6] hover:text-[#F2F0EB]'
            }`}
          >
            The House
          </Link>
          <Link
            to="/movies"
            className={`px-4 py-1.5 rounded-full text-xs transition-colors ${
              active === 'movies'
                ? 'font-semibold bg-[#C8FF1F] text-[#1E2227]'
                : 'font-medium text-[#B5AFA6] hover:text-[#F2F0EB]'
            }`}
          >
            Movies
          </Link>
        </div>
        <span className="hidden md:inline-block text-xs font-medium text-[#B5AFA6]">
          Konkani Samudai · Margao, Goa
        </span>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <Link
          to="/my-tickets"
          title="My Tickets"
          className="relative w-10 h-10 rounded-full bg-[#1E2227]/85 backdrop-blur-md border border-[#B5AFA6]/25 text-[#F2F0EB] hover:bg-[#C8FF1F] hover:text-[#1E2227] inline-flex items-center justify-center transition-colors"
        >
          {TICKET_ICON}
          {count > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#C8FF1F] text-[#1E2227] font-mono text-[10px] font-bold flex items-center justify-center tabular-nums">
              {count}
            </span>
          )}
        </Link>
        <AccountButton tone={localStorage.getItem('token') ? 'light' : 'dark'} />
      </div>
    </div>
  );
}

export function SubNavbar() {
  const { pathname } = useLocation();
  const count = useTicketCount(pathname);
  return (
    <header className="sticky top-0 z-40 pt-4 px-4 sm:px-6 bg-[#1E2227]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto rounded-full bg-[#252A30] border border-[#B5AFA6]/20 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center bg-[#1E2227] border border-[#B5AFA6]/20 rounded-full p-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `px-4 py-1.5 rounded-full text-xs transition-colors ${
                  isActive
                    ? 'font-semibold bg-[#C8FF1F] text-[#1E2227]'
                    : 'font-medium text-[#B5AFA6] hover:text-[#F2F0EB]'
                }`
              }
            >
              The House
            </NavLink>
            <NavLink
              to="/movies"
              className={({ isActive }) =>
                `px-4 py-1.5 rounded-full text-xs transition-colors ${
                  isActive
                    ? 'font-semibold bg-[#C8FF1F] text-[#1E2227]'
                    : 'font-medium text-[#B5AFA6] hover:text-[#F2F0EB]'
                }`
              }
            >
              Movies
            </NavLink>
          </div>
          <span className="hidden md:inline-block text-xs font-medium text-[#B5AFA6]">
            Konkani Samudai · Margao, Goa
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            to="/movies"
            title="Movies"
            className="w-9 h-9 rounded-full bg-[#1E2227] border border-[#B5AFA6]/25 text-[#F2F0EB] hover:bg-[#C8FF1F] hover:text-[#1E2227] inline-flex items-center justify-center transition-colors"
          >
            {MOVIE_ICON}
          </Link>
          <Link
            to="/my-tickets"
            title="My Tickets"
            className="relative w-9 h-9 rounded-full bg-[#1E2227] border border-[#B5AFA6]/25 text-[#F2F0EB] hover:bg-[#C8FF1F] hover:text-[#1E2227] inline-flex items-center justify-center transition-colors"
          >
            {TICKET_ICON}
            {count > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#C8FF1F] text-[#1E2227] font-mono text-[10px] font-bold flex items-center justify-center tabular-nums">
                {count}
              </span>
            )}
          </Link>
          <AccountButton />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 bg-[#B5AFA6] text-[#1E2227] border-t border-[#1E2227]/15">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="font-editorial text-2xl font-semibold text-[#1E2227]">Konkani Samudai</span>
            <span className="px-2 py-0.5 rounded-full bg-[#1E2227] text-[#C8FF1F] font-mono text-[10px] font-semibold">
              EST. 1934
            </span>
          </div>
          <p className="text-sm text-[#2C3138] leading-relaxed max-w-md">
            A members’ house for Konkani film, food and community in Margao. Keeping the screen lit since 1934.
          </p>
        </div>

        <div className="md:col-span-3 space-y-2 text-xs">
          <p className="font-semibold uppercase tracking-wider text-[#2C3138]">Navigation</p>
          <ul className="space-y-1.5 font-medium">
            <li><Link to="/" className="hover:underline">The House</Link></li>
            <li><Link to="/movies" className="hover:underline">Movies &amp; Showtimes</Link></li>
            <li><Link to="/my-tickets" className="hover:underline">My Tickets</Link></li>
            <li><Link to="/login" className="hover:underline">Household Login</Link></li>
          </ul>
        </div>

        <div className="md:col-span-4 space-y-2 text-xs">
          <p className="font-semibold uppercase tracking-wider text-[#2C3138]">Samudai Cineplex · Margao</p>
          <p className="text-[#2C3138]">Near Municipal Garden, Margao, Goa 403601</p>
          <p className="font-mono text-[#1E2227] font-semibold tabular-nums">Committee Desk · 10:00 – 18:00 Daily</p>
          <p className="text-[#2C3138]/80 pt-2">Cinema, festivals and the Konkani community since 1934.</p>
        </div>
      </div>
    </footer>
  );
}

export function Lightbox({ images, index, onChange, onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') onChange((index - 1 + images.length) % images.length);
      if (event.key === 'ArrowRight') onChange((index + 1) % images.length);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [index, images.length, onChange, onClose]);

  const image = images[index];
  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#16191D]/95 backdrop-blur-sm flex flex-col justify-between p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Gallery photograph"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between text-[#F2F0EB]">
        <span className="font-mono text-xs text-[#C8FF1F] tabular-nums">
          {index + 1} / {images.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-[#252A30] border border-[#B5AFA6]/25 flex items-center justify-center"
          aria-label="Close gallery"
        >
          {CLOSE_ICON}
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center gap-4 py-4" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={() => onChange((index - 1 + images.length) % images.length)}
          className="w-10 h-10 rounded-full bg-[#252A30] border border-[#B5AFA6]/25 text-[#F2F0EB] hover:bg-[#C8FF1F] hover:text-[#1E2227]"
          aria-label="Previous photograph"
        >
          ←
        </button>
        <img
          src={image.url}
          alt={image.caption || 'Konkani Samudai gallery photograph'}
          className="max-h-[72vh] max-w-[82vw] rounded-2xl object-contain"
        />
        <button
          type="button"
          onClick={() => onChange((index + 1) % images.length)}
          className="w-10 h-10 rounded-full bg-[#252A30] border border-[#B5AFA6]/25 text-[#F2F0EB] hover:bg-[#C8FF1F] hover:text-[#1E2227]"
          aria-label="Next photograph"
        >
          →
        </button>
      </div>
      {image.caption && <p className="text-center text-sm text-[#B5AFA6]">{image.caption}</p>}
    </div>
  );
}
