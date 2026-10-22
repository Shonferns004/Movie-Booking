import { useEffect, useState } from 'react';
import api, { assetUrl } from '../services/api.js';
import { Link } from 'react-router-dom';

const FALLBACK_POSTER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBOo5aPBJ7vdVsyiAG9pfkMVnbOJYOVjsyddb_wdpsXPO4tgUUifaP9nMyjEo-fKxK_ZjauieUWHBTRdqvu8Q4CcOErASg1hSKV9obttLqrrs6jTlTsxDnxRJLtWEC4hmHH1qRKkwdlvckJI1x8oqYkdtQp6GDkqg9I2cHnbuZMEXP4XfOWNlSml_xs9RBxGEFaj-pYqP9suJE5VFC4RFuakypp44Chxara4FwGIgRyLVZSH5AUU610lQ';

export default function Home() {
  const [movies, setMovies] = useState([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => { api.get('/movies').then((r) => setMovies(r.data)).catch(console.error); }, []);

  useEffect(() => {
    if (movies.length === 0) return;
    const id = setInterval(() => setCurrent((c) => (c + 1) % movies.length), 4000);
    return () => clearInterval(id);
  }, [movies.length]);

  return (
    <>
      {/* Ambient Deep Lighting */}
      <div aria-hidden="true" className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="radial-beam absolute inset-0"></div>
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[70rem] h-[36rem] bg-indigo-500/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-10 right-0 w-[40rem] h-[40rem] bg-peri-400/5 blur-[140px] rounded-full"></div>
      </div>

      {/* CYLINDRICAL COVER-FLOW HERO */}
      <section className="relative z-10 pt-8 pb-16 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="max-w-4xl mx-auto text-center relative z-20">

          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto font-normal">
            Live seat maps, secure holds, and instant QR tickets.
          </p>
        </div>

        <div className="perspective-stage relative max-w-6xl mx-auto mt-8 h-[550px] sm:h-[620px] flex items-center justify-center">
          <div className="mirror-floor curved-track absolute inset-x-0 bottom-4 h-56 rounded-[100%] pointer-events-none opacity-80 border-t border-peri-400/20"></div>
          <div className="coverflow-carousel relative w-full h-full flex items-center justify-center">
            {movies.map((m, i) => {
              const total = movies.length || 1;
              let offset = (i - current + total) % total;
              if (offset > total / 2) offset -= total;
              const theta = offset * 26;
              const tx = offset * 280;
              const tz = Math.abs(offset) * -160 + (offset === 0 ? 60 : 0);
              const ry = offset * -28;
              const scale = offset === 0 ? 1.08 : 0.88 - Math.abs(offset) * 0.05;
              const opacity = Math.abs(offset) > 1.5 ? 0.35 : (offset === 0 ? 1 : 0.75);
              const zIndex = 20 - Math.abs(offset) * 5;
              const poster = assetUrl(m.thumbnail_url) || FALLBACK_POSTER;
              return (
                <div
                  key={m.id}
                  onClick={() => setCurrent(i)}
                  className={`flow-card absolute w-[275px] sm:w-[320px] rounded-2xl bg-[#22283A] border border-peri-400/40 p-3 shadow-card-panel cursor-pointer select-none ${offset === 0 ? 'ring-2 ring-peri-400 shadow-glow-peri-lg' : ''}`}
                  style={{ transform: `translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`, opacity, zIndex }}
                >
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-black">
                    <img alt={`Poster artwork for ${m.title}`} className="w-full h-full object-cover" src={poster} />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#22283A] via-transparent to-transparent"></div>
                    <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded text-[10px] font-bold bg-[#10131C]/90 text-peri-300 border border-peri-400/30 backdrop-blur-md">{m.certification || 'UA'}</span>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-white">{m.title}</h3>
                      <span className="text-[10px] font-medium text-peri-300">{m.language || 'English'}</span>
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#10131C] text-slate-300 border border-[#2E364F]">{m.language || 'English'}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#10131C] text-slate-300 border border-[#2E364F]">{m.duration_minutes || 120} min</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#10131C] text-slate-300 border border-[#2E364F]">{m.genre || 'Drama'}</span>
                    </div>
                    <Link to={`/movies/${m.slug || m.id}`} className="mt-3.5 w-full py-2 rounded-lg bg-gradient-to-r from-peri-400 to-indigo-400 hover:from-peri-300 hover:to-indigo-300 text-midnight-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1 transition-all">
                      <span>View shows</span>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"/></svg>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
          <button aria-label="Previous poster" onClick={() => setCurrent((c) => (c - 1 + movies.length) % movies.length)} className="absolute left-2 sm:left-6 z-30 w-12 h-12 rounded-full bg-[#22283A]/90 hover:bg-[#2E364F] border border-peri-400/40 text-peri-300 flex items-center justify-center shadow-glow-peri transition-transform active:scale-95">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg>
          </button>
          <button aria-label="Next poster" onClick={() => setCurrent((c) => (c + 1) % movies.length)} className="absolute right-2 sm:right-6 z-30 w-12 h-12 rounded-full bg-[#22283A]/90 hover:bg-[#2E364F] border border-peri-400/40 text-peri-300 flex items-center justify-center shadow-glow-peri transition-transform active:scale-95">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg>
          </button>
        </div>

        {/* Search removed */}
      </section>

      {/* MOVIE SHOWCASE GRID */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24" id="movies">
        <div className="flex items-center justify-between mb-8 pb-3 border-b border-[#22283A]">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>Now Showing</span>
              <span className="text-xs px-2 py-0.5 rounded bg-peri-400/10 text-peri-400 border border-peri-400/20 font-semibold">{movies.length} Releases</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Select a showtime to reserve seats on the live seat visualizer.</p>
          </div>
        </div>
        {movies.length === 0 && <p className="text-center text-slate-400">No movies published yet.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-7">
          {movies.map((m) => (
            <article key={m.id} className="bg-[#22283A] rounded-2xl overflow-hidden border border-[#2E364F] hover:border-peri-400/50 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-card-panel flex flex-col group">
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-indigo-950/60 via-slate-900 to-[#10131C]">
                <img alt={`Poster artwork for ${m.title}`} className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500" src={assetUrl(m.thumbnail_url) || FALLBACK_POSTER} />
                <div className="absolute inset-0 bg-gradient-to-t from-[#22283A] via-transparent to-transparent"></div>
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wider bg-[#10131C]/80 text-peri-300 border border-peri-400/30 backdrop-blur-md shadow-sm">{m.certification || 'UA'}</span>
              </div>
              <div className="p-5 flex-grow flex flex-col justify-between bg-[#22283A]">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xl font-bold text-white group-hover:text-peri-400 transition-colors">{m.title}</h3>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 mb-3.5 leading-relaxed">{m.synopsis || ''}</p>
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#10131C] text-slate-300 border border-[#2E364F]">{m.language || 'English'}</span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#10131C] text-slate-300 border border-[#2E364F]">{m.duration_minutes || 120} min</span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#10131C] text-slate-300 border border-[#2E364F]">{m.genre || 'Drama'}</span>
                  </div>
                </div>
                <Link to={`/movies/${m.slug || m.id}`} className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-peri-400 to-indigo-400 hover:from-peri-300 hover:to-indigo-300 text-midnight-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-peri-400/20 group-hover:shadow-glow-peri transition-all duration-200">
                  <span>View shows</span>
                  <svg className="w-3.5 h-3.5 font-bold transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"/></svg>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </main>

      {/* FEATURES BANNER */}
      <section className="border-t border-b border-[#22283A] bg-[#10131C] py-12 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { title: 'Live Hold Guarantee', desc: 'Your selected seats are locked for 8 minutes during checkout, preventing any double-bookings.' },
            { title: 'Instant QR Passes', desc: 'Scan tickets directly at the turnstile right from Apple/Google Wallet or SMS link.' },
            { title: 'Club Samudai Privileges', desc: 'Earn popcorn upgrades and premier seat priority with every screening ticket purchased.' },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#22283A] border border-peri-400/30 flex items-center justify-center text-peri-400 flex-shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white mb-1">{f.title}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 bg-[#0A0C13] text-slate-400 text-xs border-t border-[#22283A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <h5 className="text-white font-semibold mb-3 tracking-wider uppercase text-[11px]">Cinema Locations</h5>
              <ul className="space-y-2">
                <li><a className="hover:text-peri-400 transition-colors" href="#">City Mall, Mangaluru</a></li>
                <li><a className="hover:text-peri-400 transition-colors" href="#">Samudai Plaza, Udupi</a></li>
                <li><a className="hover:text-peri-400 transition-colors" href="#">Panaji Heritage Screen, Goa</a></li>
              </ul>
            </div>
            <div>
              <h5 className="text-white font-semibold mb-3 tracking-wider uppercase text-[11px]">Experiences</h5>
              <ul className="space-y-2">
                <li><a className="hover:text-peri-400 transition-colors" href="#">Konkani Film Festival</a></li>
                <li><a className="hover:text-peri-400 transition-colors" href="#">Dolby Atmos Prime</a></li>
                <li><a className="hover:text-peri-400 transition-colors" href="#">VIP Recliner Lounges</a></li>
              </ul>
            </div>
            <div>
              <h5 className="text-white font-semibold mb-3 tracking-wider uppercase text-[11px]">Help &amp; Policies</h5>
              <ul className="space-y-2">
                <li><a className="hover:text-peri-400 transition-colors" href="#">Cancellation &amp; Refunds</a></li>
                <li><a className="hover:text-peri-400 transition-colors" href="#">Food &amp; Beverages Menu</a></li>
                <li><a className="hover:text-peri-400 transition-colors" href="#">Privacy Policy</a></li>
              </ul>
            </div>
            <div>
              <h5 className="text-white font-semibold mb-3 tracking-wider uppercase text-[11px]">Stay Connected</h5>
              <p className="mb-3 text-slate-400">Subscribe for early access to blockbuster Konkani releases.</p>
              <div className="flex gap-2">
                <input className="bg-[#22283A] border-[#2E364F] rounded-lg px-3 py-1.5 text-xs text-white focus:ring-peri-400 focus:border-peri-400 w-full" placeholder="Email address" type="email" />
                <button className="bg-peri-400 text-midnight-950 font-bold px-3 py-1.5 rounded-lg hover:bg-peri-300">Join</button>
              </div>
            </div>
          </div>
          <div className="pt-6 border-t border-[#22283A] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>© 2025 Konkani Samudai Theatres Pvt Ltd. All rights reserved.</p>
            <div className="flex items-center space-x-6">
              <a className="hover:text-peri-400 transition-colors" href="#">Terms of Service</a>
              <a className="hover:text-peri-400 transition-colors" href="#">Security</a>
              <a className="hover:text-peri-400 transition-colors" href="#">Sitemap</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
