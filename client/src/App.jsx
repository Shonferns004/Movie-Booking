import { useLayoutEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from './hooks/useMotion.js';
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
  const isAuthPage = pathname === '/login';

  useLayoutEffect(() => {
    const main = pageRef.current;
    if (!main || prefersReducedMotion() || isBookingPage) return undefined;

    const context = gsap.context(() => {
      // Every visible block eases in on its own beat: headings, copy, cards,
      // links, buttons and images. Elements already handled by a scroll reveal
      // are skipped so nothing animates twice.
      const targets = gsap.utils
        .toArray('h1,h2,h3,h4,p,article,button,a,img,li,label,blockquote', main)
        .filter((element) => {
          if (element.closest('[data-no-enter]')) return false;
          if (element.closest('[data-reveal]')) return false;
          if (element.closest('[role="dialog"]')) return false;
          if (element.closest('[aria-hidden="true"]')) return false;
          const rect = element.getBoundingClientRect();
          return rect.top < window.innerHeight * 1.02 && rect.bottom > 0;
        })
        .slice(0, 90);

      if (!targets.length) return;

      gsap.fromTo(
        targets,
        { autoAlpha: 0, y: 16 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.55,
          ease: 'power3.out',
          stagger: { amount: Math.min(0.65, targets.length * 0.018) },
          overwrite: 'auto',
          clearProps: 'transform',
        },
      );
    }, main);

    const refresh = window.setTimeout(() => ScrollTrigger.refresh(), 140);
    return () => {
      window.clearTimeout(refresh);
      context.revert();
    };
  }, [pathname, isBookingPage]);

  return (
    <div className="min-h-screen bg-[#1E2227] text-[#F2F0EB] flex flex-col">
      <a className="skip-link" href="#main-content">Skip to content</a>
      {!isHeroPage && !isAuthPage && <SubNavbar />}
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
      {!isBookingPage && !isAuthPage && <SiteFooter />}
    </div>
  );
}
