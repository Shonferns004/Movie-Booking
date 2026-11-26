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
import RefundPolicy from './pages/RefundPolicy.jsx';
import Login from './pages/Login.jsx';
import UiIcon from './components/UiIcon.jsx';
import { session } from './services/api.js';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true, icon: 'diversity_3' },
  { to: '/gallery', label: 'Gallery', icon: 'photo_library' },
];

const TICKETS_LINK = { to: '/my-tickets', label: 'My tickets', icon: 'confirmation_number' };

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="relative flex h-11 w-11 shrink-0 -rotate-3 items-center justify-center rounded-[14px] bg-[#C8FF1F] text-[#1E2227] shadow-lg shadow-black/25 transition-transform duration-300 group-hover:rotate-0 group-hover:scale-105"
    >
      <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#1E2227]" />
      <span className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#1E2227]" />
      <span className="absolute inset-x-2 top-[7px] h-px bg-[#1E2227]/25" />
      <span className="absolute inset-x-2 bottom-[7px] h-px bg-[#1E2227]/25" />
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
    const onPointerDown = (event) => {
      if (!event.target.closest?.('[data-account-menu]')) setAccountOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [accountOpen]);

  function logout() {
    session.logout();
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
    'inline-flex h-10 items-center gap-2 rounded-full border border-[#F2F0EC]/18 px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-[#F2F0EC]/85 transition-colors hover:border-[#C8FF1F] hover:text-[#C8FF1F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C8FF1F]';

  return (
    <header
      className={`${onHome ? 'fixed' : 'sticky'} inset-x-0 top-0 z-50 px-3 pt-3 font-['Public_Sans',system-ui,sans-serif] text-[#F2F0EC] transition-all duration-300 sm:px-4 sm:pt-4`}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2.5">
        <div
          className={`flex h-14 min-w-0 items-center gap-1.5 rounded-full border pl-1.5 pr-1.5 backdrop-blur-2xl transition-colors duration-300 ${
            overHero
              ? 'border-[#F2F0EC]/20 bg-[#171B1F]/45'
              : 'border-[#F2F0EC]/12 bg-[#171B1F]/92 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.9)]'
          }`}
        >
          <Link
            to="/"
            aria-label="Konkani Samudai home"
            className="group flex min-w-0 items-center gap-2.5 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C8FF1F]"
          >
            <BrandMark />
            <span className="hidden whitespace-nowrap pr-1 font-['Fraunces',Georgia,serif] text-[19px] font-bold leading-none tracking-tight sm:block sm:text-[20px]">
              Konkani <span className="italic text-[#C8FF1F]">Samudai</span>
            </span>
          </Link>

          <nav aria-label="Primary navigation" className="hidden items-center gap-1 pl-1 md:flex">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `kk-nav-pill${isActive ? ' is-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link to="/movies" aria-label="Browse movies" className="kk-circle">
            <UiIcon name="search" className="text-[20px]" />
          </Link>

          <Link
            to="/movies"
            className="kk-shine kk-shine-slow hidden h-12 items-center gap-2 rounded-full bg-[#C8FF1F] px-5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#171B1F] shadow-[0_10px_24px_-14px_rgba(200,255,31,0.9)] transition-all hover:-translate-y-0.5 hover:bg-[#D9FF66] lg:inline-flex"
          >
            <UiIcon name="local_activity" className="text-[17px]" />
            Book tickets
          </Link>

          {token ? (
            <div className="relative" data-account-menu>
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-label="Account menu"
                className="kk-circle kk-circle-lime"
              >
                <UiIcon name="person" className="text-[21px]" />
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+12px)] z-50 w-[274px] overflow-hidden rounded-2xl border border-[#F2F0EC]/12 bg-[#1E2227] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.95)]"
                >
                  <div className="flex items-center gap-3 bg-[#C8FF1F]/[0.08] px-4 py-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#C8FF1F] text-[#171B1F]">
                      <UiIcon name="person" className="text-[22px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[#F2F0EC]">{accountName}</p>
                      <p className="truncate text-[10px] text-[#F2F0EC]/50">{accountPhone || 'Signed in'}</p>
                    </div>
                  </div>
                  <div className="p-1.5">
                    <Link
                      to="/my-tickets"
                      role="menuitem"
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-semibold text-[#F2F0EC]/85 transition-colors hover:bg-[#F2F0EC]/[0.06] hover:text-[#F2F0EC]"
                    >
                      <UiIcon name="confirmation_number" className="text-[18px] text-[#C8FF1F]" />
                      My tickets
                    </Link>
                    <Link
                      to="/gallery"
                      role="menuitem"
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-semibold text-[#F2F0EC]/85 transition-colors hover:bg-[#F2F0EC]/[0.06] hover:text-[#F2F0EC]"
                    >
                      <UiIcon name="photo_library" className="text-[18px] text-[#C8FF1F]" />
                      Gallery
                    </Link>
                    <div className="my-1 h-px bg-[#F2F0EC]/10" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={logout}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold text-[#F08A80] transition-colors hover:bg-[#F08A80]/10"
                    >
                      <UiIcon name="logout" className="text-[18px]" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" aria-label="Sign in" className={`kk-circle${onHome && !scrolled ? '' : ''}`}>
              <UiIcon name="person" className="text-[20px]" />
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
            className="kk-circle md:hidden"
          >
            <UiIcon name={mobileOpen ? 'close' : 'menu'} className="text-[20px]" />
          </button>
        </div>
      </div>

      <div
        id="mobile-navigation"
        className={`mx-auto mt-2 max-w-7xl overflow-hidden rounded-3xl border border-[#F2F0EC]/12 bg-[#171B1F]/96 backdrop-blur-2xl transition-all duration-300 md:hidden ${
          mobileOpen ? 'max-h-[460px] opacity-100' : 'max-h-0 border-transparent opacity-0'
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
                  `flex items-center gap-3 rounded-2xl px-3 py-3 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
                    isActive ? 'bg-[#C8FF1F]/10 text-[#C8FF1F]' : 'text-[#F2F0EC]/70 hover:bg-[#F2F0EC]/[0.05] hover:text-[#F2F0EC]'
                  }`
                }
              >
                <UiIcon name={item.icon} className="text-[18px]" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
            <Link
              to="/movies"
              className="kk-shine kk-shine-slow mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-[#C8FF1F] px-3 py-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#171B1F]"
            >
              <UiIcon name="local_activity" className="text-[17px]" />
              Book movie tickets
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}

function FooterColumn({ title, links }) {
  return (
    <div>
      <h4 className="font-['Fraunces',Georgia,serif] text-[15px] font-bold text-[#F2F0EC]">{title}</h4>
      <ul className="mt-4 space-y-2.5 text-[12.5px]">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.to}
              className="text-[#C8FF1F]/85 transition-colors hover:text-[#C8FF1F]"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SiteFooter() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  function subscribe(event) {
    event.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
    setEmail('');
  }

  return (
    <footer className="border-t border-[#F2F0EC]/10 bg-[#171B1F] font-['Public_Sans',system-ui,sans-serif] text-[#F2F0EC]/60">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.35fr]">
          <FooterColumn
            title="Cinemas"
            links={[
              { label: 'City Mall, Mangaluru', to: '/movies' },
              { label: 'Samudai Plaza, Udupi', to: '/movies' },
              { label: 'Panaji Heritage Screen, Goa', to: '/movies' },
            ]}
          />
          <FooterColumn
            title="Experiences"
            links={[
              { label: 'Konkani Film Festival', to: '/#events' },
              { label: 'Dolby Atmos Prime', to: '/movies' },
              { label: 'VIP Recliner Lounges', to: '/movies' },
            ]}
          />
          <FooterColumn
            title="Help"
            links={[
              { label: 'Cancellation & refunds', to: '/refunds' },
              { label: 'Food & beverages menu', to: '/#events' },
              { label: 'Privacy policy', to: '/' },
            ]}
          />

          <div>
            <h4 className="font-['Fraunces',Georgia,serif] text-[15px] font-bold text-[#F2F0EC]">
              Get release alerts
            </h4>
            <p className="mt-4 max-w-[260px] text-[12.5px] leading-relaxed">
              Be first to know when new Konkani films open.
            </p>
            {subscribed ? (
              <p className="mt-4 text-[12px] font-semibold text-[#B6E36A]">
                You’re on the list — we’ll write when the next film opens.
              </p>
            ) : (
              <form onSubmit={subscribe} className="mt-4 flex max-w-[320px] items-center gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email address"
                  className="h-11 min-w-0 flex-1 rounded-lg border border-[#F2F0EC]/20 bg-[#1E2227] px-3.5 text-[12px] text-[#F2F0EC] outline-none placeholder:text-[#F2F0EC]/35 focus:border-[#C8FF1F]/60"
                />
                <button
                  type="submit"
                  className="h-11 shrink-0 rounded-lg bg-[#C8FF1F] px-5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#171B1F] transition-colors hover:bg-[#D9FF66]"
                >
                  Join
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-[#F2F0EC]/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px]">
            © {new Date().getFullYear()} Konkani Samudai Theatres Pvt Ltd. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[12px]">
            <li><Link to="/" className="text-[#C8FF1F]/85 transition-colors hover:text-[#C8FF1F]">Terms of service</Link></li>
            <li><Link to="/" className="text-[#C8FF1F]/85 transition-colors hover:text-[#C8FF1F]">Security</Link></li>
            <li><Link to="/" className="text-[#C8FF1F]/85 transition-colors hover:text-[#C8FF1F]">Sitemap</Link></li>
          </ul>
        </div>
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
    <div className="min-h-screen bg-[#1E2227] text-[#F2F0EC]">
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
          <Route path="/refunds" element={<RefundPolicy />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  );
}
