import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import Home from './pages/Home.jsx';
import Community from './pages/Community.jsx';
import Gallery from './pages/Gallery.jsx';
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
      className="relative flex h-11 w-11 shrink-0 -rotate-3 items-center justify-center rounded-[14px] bg-[#F5C542] text-[#131315] shadow-lg shadow-black/25 transition-transform duration-300 group-hover:rotate-0 group-hover:scale-105"
    >
      <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#131315]" />
      <span className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#131315]" />
      <span className="absolute inset-x-2 top-[7px] h-px bg-[#131315]/25" />
      <span className="absolute inset-x-2 bottom-[7px] h-px bg-[#131315]/25" />
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
    const onScroll = () => setScrolled(window.scrollY > 8);
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
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('youpiCustomerToken');
    setToken(false);
    setMobileOpen(false);
    navigate('/', { replace: true });
  }

  // My tickets only exists for signed-in visitors.
  const links = token ? [...NAV_LINKS, TICKETS_LINK] : NAV_LINKS;

  // On the community page the bar floats over the hero until the page scrolls.
  const onHome = pathname === '/';
  const overHero = onHome && !scrolled && !mobileOpen;

  const authClass =
    'inline-flex h-10 items-center gap-2 rounded-full border border-[#E5E1E4]/18 px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-[#E5E1E4]/85 transition-colors hover:border-[#F5C542] hover:text-[#F5C542] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5C542]';

  return (
    <header
      className={`${onHome ? 'fixed' : 'sticky'} inset-x-0 top-0 z-50 font-['Public_Sans',system-ui,sans-serif] text-[#E5E1E4] transition-all duration-300 ${
        overHero
          ? 'kk-nav-over'
          : 'border-b border-[#F5C542]/15 bg-[#151013]/95 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl'
      }`}
    >
      <div className="mx-auto flex h-[74px] max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          aria-label="Konkani Samudai home"
          className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5C542]"
        >
          <BrandMark />
          <span className="block whitespace-nowrap font-['Fraunces',Georgia,serif] text-[21px] font-bold leading-none tracking-tight sm:text-[23px]">
            Konkani <span className="italic text-[#F5C542]">Samudai</span>
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
            className="hidden h-10 items-center gap-2 rounded-full bg-gradient-to-r from-[#FFD86B] to-[#F5C542] px-4 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#131315] shadow-[0_12px_28px_-14px_rgba(245, 197, 66,1)] transition-all hover:-translate-y-0.5 hover:from-[#FFE08A] hover:to-[#E6B32A] lg:inline-flex"
          >
            <span className="material-symbols-outlined text-[17px]">local_activity</span>
            Book tickets
          </Link>

          {token ? (
            <button type="button" onClick={logout} className={authClass}>
              <span className="material-symbols-outlined text-[17px]">logout</span>
              <span className="hidden sm:inline">Logout</span>
            </button>
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
            onClick={() => setMobileOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E1E4]/15 text-[#E5E1E4] transition-colors hover:border-[#F5C542] hover:text-[#F5C542] md:hidden"
          >
            <span className="material-symbols-outlined">{mobileOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </div>

      <div
        id="mobile-navigation"
        className={`grid overflow-hidden border-t border-[#F5C542]/15 bg-[#151013] transition-[grid-template-rows,opacity] duration-300 md:hidden ${
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
                    isActive ? 'bg-[#F5C542]/10 text-[#F5C542]' : 'text-[#E5E1E4]/70 hover:bg-[#E5E1E4]/[0.05] hover:text-[#E5E1E4]'
                  }`
                }
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
            <Link
              to="/movies"
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#F5C542] px-3 py-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#131315]"
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
    <footer className="border-t border-[#E5E1E4]/10 bg-[#131315] font-['Public_Sans',system-ui,sans-serif] text-[#E5E1E4]/65">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-2 self-start transition-colors hover:text-[#E5E1E4]">
          <span className="material-symbols-outlined text-[#F5C542]">local_movies</span>
          <span className="font-['Fraunces',Georgia,serif] text-sm font-bold text-[#E5E1E4]">Konkani Samudai</span>
        </Link>
        <p className="text-xs">A shared screen for Konkani stories and cinema.</p>
        <Link to="/my-tickets" className="self-start text-xs font-semibold transition-colors hover:text-[#F5C542] sm:self-auto">
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
    <div className="min-h-screen bg-[#131315] text-[#E5E1E4]">
      {!isAuthRoute && <Nav />}
      <main ref={pageRef} className="kk-body min-h-[65vh]">
        <Routes>
          <Route path="/" element={<Community />} />
          <Route path="/movies" element={<Home />} />
          <Route path="/gallery" element={<Gallery />} />
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
