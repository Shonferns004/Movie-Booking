import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api.js';

export default function MovieDetails() {
  const { id } = useParams();
  const [movie, setMovie] = useState(null);
  const [shows, setShows] = useState([]);
  useEffect(() => {
    api.get(`/movies/${id}`).then((r) => setMovie(r.data)).catch(console.error);
  }, [id]);
  useEffect(() => {
    if (!movie) return;
    api.get('/shows', { params: { movieId: movie.id } }).then((r) => setShows(r.data)).catch(console.error);
  }, [movie]);
  if (!movie) return <p>Loading...</p>;
  return (
    <div>
      <h1>{movie.title}</h1>
      <p>{movie.synopsis}</p>
      <h3>Showtimes</h3>
      {shows.map((s) => (
        <div className="card" key={s.id}>
          <p>{new Date(s.starts_at).toLocaleString()} — {s.status}</p>
          <Link to={`/shows/${s.id}/seats`}>Select seats</Link>
        </div>
      ))}
      {shows.length === 0 && <p>No shows scheduled.</p>}
    </div>
  );
}
