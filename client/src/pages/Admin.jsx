import { useEffect, useState } from 'react';
import api from '../services/api.js';

export default function Admin() {
  const [movies, setMovies] = useState([]);
  const [theatres, setTheatres] = useState([]);
  const [auditoriums, setAuditoriums] = useState([]);
  const [seats, setSeats] = useState([]);
  const [categoryList, setCategoryList] = useState([]);
  const [shows, setShows] = useState([]);
  const [copiedPrices, setCopiedPrices] = useState(null);
  const [form, setForm] = useState({
    movieId: '',
    movieName: '',
    theatreId: '',
    auditoriumId: '',
    date: '',
    time: '',
    trailerUrl: '',
    posterPreview: '',
  });
  const [prices, setPrices] = useState({});
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.get('/movies').then((r) => setMovies(r.data)).catch(console.error);
    api.get('/shows').then((r) => setShows(r.data)).catch(console.error);
    api.get('/theatres/categories').then((r) => setCategoryList(r.data)).catch(console.error);
    api.get('/theatres').then((r) => {
      setTheatres(r.data);
      if (r.data?.length) {
        const tid = r.data[0].id;
        setForm((f) => ({ ...f, theatreId: tid }));
        api.get(`/theatres/${tid}/auditoriums`).then((ar) => {
          setAuditoriums(ar.data);
          if (ar.data?.length && !form.auditoriumId) setForm((f) => ({ ...f, auditoriumId: ar.data[0].id }));
        }).catch(console.error);
      }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!form.theatreId) { setAuditoriums([]); return; }
    api.get(`/theatres/${form.theatreId}/auditoriums`).then((r) => setAuditoriums(r.data)).catch(console.error);
  }, [form.theatreId]);

  useEffect(() => {
    if (!form.auditoriumId) { setSeats([]); return; }
    api.get(`/theatres/auditoriums/${form.auditoriumId}/layout`).then((r) => {
      const s = r.data?.seats || [];
      setSeats(s);
      if (copiedPrices) {
        const cats = s.reduce((acc, seat) => {
          const name = seat.category_name || 'Unknown';
          if (!acc[name]) acc[name] = seat.category_id;
          return acc;
        }, {});
        const np = {};
        for (const [name, id] of Object.entries(cats)) {
          const cp = copiedPrices.find((p) => p.category_id === id);
          if (cp) np[name] = (cp.amount_minor / 100).toFixed(2);
        }
        setPrices(np);
        setCopiedPrices(null);
      }
    }).catch(console.error);
  }, [form.auditoriumId]);

  const seatCounts = seats.reduce((acc, s) => {
    const name = s.category_name || 'Unknown';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
  const totalSeats = seats.length;

  function setPrice(cat, value) {
    setPrices((p) => ({ ...p, [cat]: value }));
  }

  function handlePoster(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, posterPreview: reader.result }));
    reader.readAsDataURL(file);
  }

  const gross = categoryList.reduce((sum, c) => {
    const price = Number(prices[c.name] || 0);
    return sum + (seatCounts[c.name] || 0) * price;
  }, 0);

  async function submit(e) {
    e.preventDefault();
    setStatus('');
    try {
      const movie = movies.find((m) => m.id === form.movieId);
      const startsAt = new Date(`${form.date}T${form.time}:00`);
      const endsAt = new Date(startsAt.getTime() + (movie?.duration_minutes || 120) * 60000);
      const bookingOpensAt = new Date();
      const bookingClosesAt = new Date(startsAt.getTime() - 15 * 60000);
      const priceList = categoryList.map((c) => ({
        categoryId: c.id,
        amountMinor: Math.round(Number(prices[c.name] || 0) * 100),
      }));
      const res = await api.post('/shows', {
        movieId: form.movieId,
        auditoriumId: form.auditoriumId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        bookingOpensAt: bookingOpensAt.toISOString(),
        bookingClosesAt: bookingClosesAt.toISOString(),
        prices: priceList,
      });
      setStatus(`Show created: ${res.data.id}`);
    } catch (err) {
      setStatus(err.response?.data?.error || err.message);
    }
  }

  return (
    <div>
      <h1>Admin — Schedule Show</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20 }}>
        <form className="card" onSubmit={submit}>
          <h2>1. Movie & Show</h2>
          <div className="form-grid">
            <div>
              <label>Movie name</label>
              <input list="movie-options" value={form.movieName || ''} onChange={(e) => {
                const name = e.target.value;
                const m = movies.find((mv) => mv.title.toLowerCase() === name.toLowerCase());
                setForm({ ...form, movieName: name, movieId: m ? m.id : '' });
              }} placeholder="Type movie name" required />
              <datalist id="movie-options">
                {movies.map((m) => <option key={m.id} value={m.title} />)}
              </datalist>
              {form.movieName && !form.movieId && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>No matching movie</div>}
            </div>
            <div>
              <label>Auditorium</label>
              <select value={form.auditoriumId} onChange={(e) => setForm({ ...form, auditoriumId: e.target.value })} required>
                <option value="">Select auditorium</option>
                {auditoriums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div>
                <label>Show date</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div>
                <label>Show time</label>
                <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
              </div>
            </div>
          </div>

          <h2 style={{ marginTop: 20 }}>2. Movie Media</h2>
          <div className="form-grid">
            <div>
              <label>Poster upload</label>
              <input type="file" accept="image/*" onChange={handlePoster} />
              {form.posterPreview && <img src={form.posterPreview} alt="poster preview" style={{ marginTop: 10, maxWidth: 200, borderRadius: 12 }} />}
            </div>
            <div>
              <label>Trailer URL</label>
              <input value={form.trailerUrl} onChange={(e) => setForm({ ...form, trailerUrl: e.target.value })} placeholder="https://youtube.com/..." />
            </div>
          </div>

          <h2 style={{ marginTop: 20 }}>3. Seat Categories & Prices</h2>
          {categoryList.map((c) => (
            <div key={c.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{c.name}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>Seats: {seatCounts[c.name] || 0} · {totalSeats ? Math.round((seatCounts[c.name] || 0) / totalSeats * 100) : 0}%</div>
                </div>
                <div style={{ width: 160 }}>
                  <label>Price (₹)</label>
                  <input type="number" min="0" step="0.01" value={prices[c.name] || ''} onChange={(e) => setPrice(c.name, e.target.value)} />
                </div>
              </div>
            </div>
          ))}

          <button className="btn" type="submit" style={{ marginTop: 16 }}>Create Show</button>
          {status && <p style={{ marginTop: 12, color: status.includes('created') ? 'var(--success)' : 'var(--danger)' }}>{status}</p>}
        </form>

        <div className="card">
          <h2>Show Summary</h2>
          <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12 }}>
            {movies.find((m) => m.id === form.movieId)?.title || 'No movie selected'}
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Auditorium</div>
            <div>{auditoriums.find((a) => a.id === form.auditoriumId)?.name || '—'}</div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Date & Time</div>
            <div>{form.date || '—'} {form.time || ''}</div>
          </div>
          <h3>Revenue (sold out)</h3>
          {categoryList.map((c) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 13 }}>
              <span>{c.name} × {seatCounts[c.name] || 0}</span>
              <span>₹{((seatCounts[c.name] || 0) * Number(prices[c.name] || 0)).toLocaleString()}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 10, fontSize: 18 }}>
            <span>Maximum gross</span>
            <span style={{ color: 'var(--accent-2)' }}>₹{gross.toLocaleString()}</span>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 8 }}>
            Illustrative calculation from entered prices; excludes fees, taxes, discounts, refunds and complimentary tickets.
          </div>
          {seats.find((s) => s.accessible) && (
            <div style={{ marginTop: 12, color: 'var(--muted)', fontSize: 12 }}>
              Handicapped seat: {seats.find((s) => s.accessible).row_label}{seats.find((s) => s.accessible).seat_number}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
