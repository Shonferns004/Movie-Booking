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

    const seen = new WeakSet();
    let observer;
    let scanTimer;

    const context = gsap.context(() => {
      const selector = 'h1,h2,h3,h4,p,article,button,a,img,li,label,blockquote,figure';

      const shouldAnimate = (element) => {
        if (seen.has(element)) return false;
        if (element.closest('[data-no-enter]')) return false;
        if (element.closest('[data-reveal]')) return false;
        if (element.closest('[data-seat-enter]')) return false;
        if (element.closest('[role="dialog"]')) return false;
        if (element.closest('[aria-hidden="true"]')) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const reveal = () => {
        const targets = gsap.utils.toArray(selector, main).filter(shouldAnimate);
        if (!targets.length) return;

        const viewportHeight = window.innerHeight;
        const onScreen = [];
        const below = [];
        targets.forEach((element) => {
          seen.add(element);
          const rect = element.getBoundingClientRect();
          if (rect.top < viewportHeight * 1.02 && rect.bottom > 0) onScreen.push(element);
          else below.push(element);
        });

        if (onScreen.length) {
          gsap.from(onScreen, {
            autoAlpha: 0,
            y: 16,
            duration: 0.55,
            ease: 'power3.out',
            stagger: { amount: Math.min(0.6, onScreen.length * 0.018) },
            clearProps: 'transform',
          });
        }

        if (below.length) {
          gsap.set(below, { autoAlpha: 0, y: 16 });
          ScrollTrigger.batch(below, {
            start: 'top 94%',
            once: true,
            onEnter: (batch) =>
              gsap.to(batch, {
                autoAlpha: 1,
                y: 0,
                duration: 0.55,
                ease: 'power3.out',
                stagger: 0.06,
                overwrite: true,
              }),
          });
        }
      };

      const scheduleReveal = () => {
        window.clearTimeout(scanTimer);
        scanTimer = window.setTimeout(() => {
          reveal();
          ScrollTrigger.refresh();
        }, 140);
      };

      reveal();

      // Pages load their cards after mount (films, tickets, passes). Watch for
      // new nodes and give each one the same staggered ease-in.
      observer = new MutationObserver((mutations) => {
        if (mutations.some((mutation) => mutation.addedNodes.length)) scheduleReveal();
      });
      observer.observe(main, { childList: true, subtree: true });
    }, main);

    return () => {
      window.clearTimeout(scanTimer);
      if (observer) observer.disconnect();
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
