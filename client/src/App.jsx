import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import Home from './pages/Home.jsx';
import Community from './pages/Community.jsx';
import Gallery from './pages/Gallery.jsx';
import EventTicket from './pages/EventTicket.jsx';
import MovieDetails from './pages/MovieDetails.jsx';
import SeatSelection from './pages/SeatSelection.jsx';
import Checkout from './pages/Checkout.jsx';
import BookingConfirmation from './pages/BookingConfirmation.jsx';
import MyTickets from './pages/MyTickets.jsx';
import Login from './pages/Login.jsx';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true, icon: 'diversity_3' },
  { to: '/movies', label: 'Movies', icon: 'movie' },
  { to: '/gallery', label: 'Gallery', icon: 'photo_library' },
];

const TICKETS_LINK = { to: '/my-tickets', label: 'My tickets', icon: 'confirmation_number' };

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="relative flex h-11 w-11 shrink-0 -rotate-3 items-center justify-center rounded-[14px] bg-[#F4B63F] text-[#0A2A31] shadow-lg shadow-black/25 transition-transform duration-300 group-hover:rotate-0 group-hover:scale-105"
    >
      <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#0A2A31]" />
      <span className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#0A2A31]" />
      <span className="absolute inset-x-2 top-[7px] h-px bg-[#0A2A31]/25" />
      <span className="absolute inset-x-2 bottom-[7px] h-px bg-[#0A2A31]/25" />
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
  const [accountOpen, setAccountOpen] = useState(false);
  const [token, setToken] = useState(() => Boolean(localStorage.getItem('token')));
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
    setToken(Boolean(localStorage.getItem('token')));
  }, [pathname]);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [accountOpen]);

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('youpiCustomerToken');
    setToken(false);
    setMobileOpen(false);
    navigate('/', { replace: true });
  }

  // My tickets only exists for signed-in visitors.
  const links = token ? [...NAV_LINKS, TICKETS_LINK] : NAV_LINKS;

  // Profile shown in the avatar menu.
  let account = null;
  try {
    account = JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    account = null;
  }
  const accountName = String(account?.displayName || account?.name || 'Member').trim();
  const accountPhone = String(account?.mobile || account?.phone || '').trim();
  const initials =
    accountName
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || 'K';

  // On the community page the bar floats over the hero until the page scrolls.
  const onHome = pathname === '/';
  const overHero = onHome && !scrolled && !mobileOpen;

  const authClass =
    'inline-flex h-10 items-center gap-2 rounded-full border border-[#EFEBE0]/18 px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-[#EFEBE0]/85 transition-colors hover:border-[#F4B63F] hover:text-[#F4B63F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4B63F]';

  return (
    <header
      className={`${onHome ? 'fixed' : 'sticky'} inset-x-0 top-0 z-50 font-['Public_Sans',system-ui,sans-serif] text-[#EFEBE0] transition-all duration-300 ${
        overHero
          ? 'kk-nav-over'
          : 'border-b border-[#EFEBE0]/10 bg-[#061D22]/95 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl'
      }`}
    >
      <div className="mx-auto flex h-[74px] max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          aria-label="Konkani Samudai home"
          className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F4B63F]"
        >
          <BrandMark />
          <span className="block whitespace-nowrap font-['Fraunces',Georgia,serif] text-[21px] font-bold leading-none tracking-tight sm:text-[23px]">
            Konkani <span className="italic text-[#F4B63F]">Samudai</span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="ml-auto hidden items-center gap-7 md:flex">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `kk-nav-link${isActive ? ' is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-7">
          <Link
            to="/movies"
            className="hidden h-10 items-center gap-2 rounded-full bg-[#F4B63F] px-4 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#071E23] shadow-[0_10px_24px_-14px_rgba(244,182,63,0.9)] transition-all hover:-translate-y-0.5 hover:bg-[#ffcb62] lg:inline-flex"
          >
            <span className="material-symbols-outlined text-[17px]">local_activity</span>
            Book tickets
          </Link>

          {token ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-label="Account menu"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F4B63F] text-[12px] font-bold text-[#071E23] shadow-[0_8px_20px_-10px_rgba(244,182,63,0.9)] ring-2 ring-[#F4B63F]/25 transition-all hover:-translate-y-0.5 hover:ring-[#F4B63F]/70"
              >
                {accountName && accountName !== 'Member' ? (
                  <span className="leading-none">{initials}</span>
                ) : (
                  <span className="material-symbols-outlined text-[20px]">person</span>
                )}
              </button>

              {accountOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close account menu"
                    onClick={() => setAccountOpen(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+10px)] z-50 w-[262px] overflow-hidden rounded-2xl border border-[#EFEBE0]/12 bg-[#0B2A31] p-1.5 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.95)]"
                  >
                    <div className="flex items-center gap-3 rounded-xl px-3 py-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F4B63F]/15 text-[12px] font-bold text-[#F4B63F]">
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-[#EFEBE0]">{accountName}</p>
                        <p className="truncate text-[10px] text-[#EFEBE0]/50">{accountPhone || 'Signed in'}</p>
                      </div>
                    </div>
                    <div className="my-1 h-px bg-[#EFEBE0]/10" />
                    <Link
                      to="/my-tickets"
                      role="menuitem"
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[11px] font-semibold text-[#EFEBE0]/80 transition-colors hover:bg-[#EFEBE0]/[0.06] hover:text-[#EFEBE0]"
                    >
                      <span className="material-symbols-outlined text-[17px]">confirmation_number</span>
                      My tickets
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={logout}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[11px] font-semibold text-[#F07882] transition-colors hover:bg-[#F07882]/10"
                    >
                      <span className="material-symbols-outlined text-[17px]">logout</span>
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link to="/login" className={authClass}>
              <span className="material-symbols-outlined text-[17px]">person</span>
              <span className="hidden sm:inline">Sign in</span>
            </Link>
          )}

          <button
            type="button"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            onClick={() => {
              setMobileOpen((open) => !open);
              setAccountOpen(false);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#EFEBE0]/15 text-[#EFEBE0] transition-colors hover:border-[#F4B63F] hover:text-[#F4B63F] md:hidden"
          >
            <span className="material-symbols-outlined">{mobileOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </div>

      <div
        id="mobile-navigation"
        className={`grid overflow-hidden border-t border-[#EFEBE0]/10 bg-[#061D22] transition-[grid-template-rows,opacity] duration-300 md:hidden ${
          mobileOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] border-transparent opacity-0'
        }`}
      >
        <nav aria-label="Mobile navigation" className="min-h-0 overflow-hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-3 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
                    isActive ? 'bg-[#F4B63F]/10 text-[#F4B63F]' : 'text-[#EFEBE0]/70 hover:bg-[#EFEBE0]/[0.05] hover:text-[#EFEBE0]'
                  }`
                }
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
            <Link
              to="/movies"
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#F4B63F] px-3 py-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#071E23]"
            >
              <span className="material-symbols-outlined text-[17px]">local_activity</span>
              Book movie tickets
            </Link>
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
          <Route path="/" element={<Community />} />
          <Route path="/movies" element={<Home />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/event-ticket/:orderId" element={<EventTicket />} />
          <Route path="/movies/:id" element={<MovieDetails />} />
          <Route path="/shows/:showId/seats" element={<SeatSelection />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/booking/:reference" element={<BookingConfirmation />} />
          <Route path="/my-tickets" element={<MyTickets />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!isAuthRoute && pathname !== '/' && <SiteFooter />}
    </div>
  );
}
