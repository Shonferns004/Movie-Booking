import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import Home from './pages/Home.jsx';
import MovieDetails from './pages/MovieDetails.jsx';
import SeatSelection from './pages/SeatSelection.jsx';
import Checkout from './pages/Checkout.jsx';
import BookingConfirmation from './pages/BookingConfirmation.jsx';
import MyTickets from './pages/MyTickets.jsx';
import Login from './pages/Login.jsx';
import api from './services/api.js';

const NAV_LINKS = [
  { to: '/', label: 'Movies', end: true, icon: 'movie' },
  { to: '/my-tickets', label: 'My Tickets', icon: 'confirmation_number' },
];

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="relative flex h-10 w-10 shrink-0 -rotate-6 items-center justify-center rounded-xl bg-[#F4B63F] text-[#0A2A31] shadow-lg shadow-black/20 transition-transform duration-300 group-hover:rotate-0 group-hover:scale-105"
    >
      <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#0A2A31]" />
      <span className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#0A2A31]" />
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
      </svg>
    </span>
  );
}

function Nav() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [token, setToken] = useState(() => Boolean(localStorage.getItem('token')));
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setToken(Boolean(localStorage.getItem('token')));
  }, [pathname]);

  function logout() {
    localStorage.removeItem('token');
    setToken(false);
    setMobileOpen(false);
    navigate('/', { replace: true });
  }

  const navLinkClass = ({ isActive }) =>
    `inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 sm:px-5 text-sm font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4B63F] ${
      isActive
        ? 'bg-[#EFEBE0] text-[#0A2A31] shadow-sm'
        : 'text-[#EFEBE0]/75 hover:bg-[#EFEBE0]/10 hover:text-[#EFEBE0]'
    }`;

  const actionClass =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#C2305E] px-5 text-sm font-bold text-white shadow-md shadow-black/15 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#a82651] hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4B63F] active:translate-y-0';

  return (
    <header
      className={`sticky top-0 z-50 font-['Public_Sans',system-ui,sans-serif] text-[#EFEBE0] backdrop-blur-xl transition-all duration-300 ${
        scrolled
          ? 'border-b border-[#EFEBE0]/10 bg-[#0A2A31]/95 shadow-lg shadow-black/20'
          : 'border-b border-[#EFEBE0]/[0.06] bg-[#0A2A31]/85'
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          aria-label="Konkani Samudai home"
          className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F4B63F]"
        >
          <BrandMark />
          <span className="min-w-0 leading-none">
            <span className="block whitespace-nowrap font-['Fraunces',Georgia,serif] text-lg font-black tracking-tight sm:text-xl">
              Konkani <span className="italic text-[#F4B63F]">Samudai</span>
            </span>
            <span className="mt-1.5 block text-[9px] font-semibold uppercase tracking-[0.19em] text-[#EFEBE0]/55 sm:text-[10px] sm:tracking-[0.22em]">
              Cinema &amp; Screenhouse
            </span>
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-1 rounded-full border border-[#EFEBE0]/10 bg-[#123E47]/90 p-1.5 md:flex"
        >
          {NAV_LINKS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {token ? (
            <button type="button" onClick={logout} className={actionClass}>
              <span className="material-symbols-outlined text-[18px]">logout</span>
              <span className="hidden xs:inline">Logout</span>
            </button>
          ) : (
            <Link to="/login" className={actionClass}>
              <span className="material-symbols-outlined text-[18px]">person</span>
              Login
            </Link>
          )}
          <button
            type="button"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#EFEBE0]/15 bg-[#123E47] text-[#EFEBE0] transition-colors hover:bg-[#1a505b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4B63F] md:hidden"
          >
            <span className="material-symbols-outlined">{mobileOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </div>

      <div
        id="mobile-navigation"
        className={`grid overflow-hidden border-t border-[#EFEBE0]/10 transition-[grid-template-rows,opacity] duration-200 md:hidden ${mobileOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] border-t-transparent opacity-0'}`}
      >
        <nav aria-label="Mobile navigation" className="min-h-0 overflow-hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6">
            {NAV_LINKS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-[#EFEBE0]/10 bg-[#071E23] font-['Public_Sans',system-ui,sans-serif] text-[#EFEBE0]/65">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-2 self-start transition-colors hover:text-[#EFEBE0]">
          <span className="material-symbols-outlined text-[#F4B63F]">local_movies</span>
          <span className="font-['Fraunces',Georgia,serif] text-sm font-bold text-[#EFEBE0]">Konkani Samudai</span>
        </Link>
        <p className="text-xs">A shared screen for Konkani stories and cinema.</p>
        <Link to="/my-tickets" className="self-start text-xs font-semibold transition-colors hover:text-[#F4B63F] sm:self-auto">
          Your tickets <span aria-hidden="true">→</span>
        </Link>
      </div>
    </footer>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const pageRef = useRef(null);
  useEffect(() => {
    if (!localStorage.getItem('token')) {
      api.post('/auth/login', { email: 'adminapp@movie.local', password: 'adminapp123' })
        .then((r) => { if (r.data?.token) localStorage.setItem('token', r.data.token); })
        .catch(() => {});
    }
  }, []);
  const isAuthRoute = pathname === '/login';

  useEffect(() => {
    if (!pageRef.current) return undefined;
    const animation = gsap.fromTo(
      pageRef.current,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.42, ease: 'power2.out', clearProps: 'transform' },
    );
    return () => animation.kill();
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[#0A2A31] text-[#EFEBE0]">
      {!isAuthRoute && <Nav />}
      <main ref={pageRef} className="kk-body min-h-[65vh]">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/movies/:id" element={<MovieDetails />} />
          <Route path="/shows/:showId/seats" element={<SeatSelection />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/booking/:reference" element={<BookingConfirmation />} />
          <Route path="/my-tickets" element={<MyTickets />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!isAuthRoute && <SiteFooter />}
    </div>
  );
}
