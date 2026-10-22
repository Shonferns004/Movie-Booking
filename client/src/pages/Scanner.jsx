import { useState } from 'react';
import api from '../services/api.js';

export default function Scanner() {
  const [ref, setRef] = useState('');
  const [showId, setShowId] = useState('');
  const [result, setResult] = useState(null);

  async function validate() {
    try {
      const r = await api.post('/staff/tickets/validate', { ticketReference: ref, showId: showId || undefined });
      setResult(r.data);
    } catch (e) {
      setResult({ result: 'ERROR', reason: e.response?.data?.error || e.message });
    }
  }

  return (
    <div className="card">
      <h1>Scanner</h1>
      <input placeholder="Ticket reference" value={ref} onChange={(e) => setRef(e.target.value)} /><br /><br />
      <input placeholder="Show ID (optional)" value={showId} onChange={(e) => setShowId(e.target.value)} /><br /><br />
      <button className="btn" onClick={validate}>Validate</button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
