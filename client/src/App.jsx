import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { gsap } from 'gsap';
import Home from './pages/Home.jsx';
import Community from './pages/Community.jsx';
import Gallery from './pages/Gallery.jsx';
import EventTicket from './pages/EventTicket.jsx';
import SeatSelection from './pages/SeatSelection.jsx';
import Checkout from './pages/Checkout.jsx';
import BookingConfirmation from './pages/BookingConfirmation.jsx';
import MyTickets from './pages/MyTickets.jsx';
import RefundPolicy from './pages/RefundPolicy.jsx';
import Login from './pages/Login.jsx';
import { SiteFooter, SubNavbar } from './components/SiteChrome.jsx';

export default function App() {
  const { pathname } = useLocation();
  const pageRef = useRef(null);
  const isHeroPage = pathname === '/' || pathname === '/movies';
  const isBookingPage = /^\/shows\/[^/]+\/seats/.test(pathname);

  useEffect(() => {
    if (!pageRef.current) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const animation = gsap.fromTo(
      pageRef.current,
      { y: 8 },
      { y: 0, duration: 0.4, ease: 'power2.out', clearProps: 'transform' },
    );
    return () => animation.kill();
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[#1E2227] text-[#F2F0EB] flex flex-col">
      <a className="skip-link" href="#main-content">Skip to content</a>
      {!isHeroPage && <SubNavbar />}
      <main id="main-content" ref={pageRef} className="flex-1">
        <Routes>
          <Route path="/" element={<Community />} />
          <Route path="/movies" element={<Home />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/event-ticket/:orderId" element={<EventTicket />} />
          <Route path="/movies/:id" element={<Navigate to="/movies" replace />} />
          <Route path="/shows/:showId/seats" element={<SeatSelection />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/booking/:reference" element={<BookingConfirmation />} />
          <Route path="/my-tickets" element={<MyTickets />} />
          <Route path="/refunds" element={<RefundPolicy />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!isBookingPage && <SiteFooter />}
    </div>
  );
}
