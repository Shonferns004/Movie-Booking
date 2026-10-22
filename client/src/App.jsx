import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import Home from './pages/Home.jsx';
import MovieDetails from './pages/MovieDetails.jsx';
import SeatSelection from './pages/SeatSelection.jsx';
import Checkout from './pages/Checkout.jsx';
import BookingConfirmation from './pages/BookingConfirmation.jsx';
import MyTickets from './pages/MyTickets.jsx';
import Login from './pages/Login.jsx';

function Nav() {
  const token = localStorage.getItem('token');
  return (
    <header className="sticky top-0 z-50 bg-transparent backdrop-blur-sm transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group" aria-label="Konkani Samudai Home">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-peri-500 via-peri-400 to-indigo-300 flex items-center justify-center shadow-lg shadow-peri-400/25 group-hover:shadow-peri-400/40 transition-shadow">
            <svg className="w-5 h-5 text-midnight-950 font-bold" fill="currentColor" viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
          </div>
          <div>
            <span className="text-xl font-extrabold tracking-wide text-white group-hover:text-peri-400 transition-colors">Konkani <span className="text-peri-400 font-semibold">Samudai</span></span>
            <span className="block text-[10px] tracking-wider uppercase text-slate-400 font-medium">Cinema &amp; Screenhouse</span>
          </div>
        </Link>
        <nav aria-label="Primary Navigation" className="hidden md:flex items-center gap-1.5 bg-[#22283A]/85 p-1.5 rounded-full border border-peri-400/20 backdrop-blur-md">
          <Link to="/" className="px-5 py-2 rounded-full text-xs font-semibold text-midnight-950 bg-gradient-to-r from-peri-400 to-indigo-300 shadow-glow-peri transition-all">Movies</Link>
          <Link to="/my-tickets" className="px-5 py-2 rounded-full text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-all">My Tickets</Link>
        </nav>
        <div className="flex items-center gap-3">
          {token ? <button className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold tracking-wide text-white bg-[#22283A] hover:bg-[#2E364F] border border-peri-400/30 hover:border-peri-400 transition-all duration-200 shadow-sm" onClick={() => { localStorage.removeItem('token'); window.location.href = '/'; }}>Logout</button> : <Link to="/login" className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold tracking-wide text-white bg-[#22283A] hover:bg-[#2E364F] border border-peri-400/30 hover:border-peri-400 transition-all duration-200 shadow-sm">Login</Link>}
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const { pathname } = useLocation();
  // The auth page renders standalone (full-screen), so the nav bar is hidden on it.
  const isAuthRoute = pathname === '/login';

  return (
    <>
      {!isAuthRoute && <Nav />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/movies/:id" element={<MovieDetails />} />
        <Route path="/shows/:showId/seats" element={<SeatSelection />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/booking/:reference" element={<BookingConfirmation />} />
        <Route path="/my-tickets" element={<MyTickets />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}
