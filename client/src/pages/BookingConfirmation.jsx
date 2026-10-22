import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api.js';
import { QRCodeSVG } from 'qrcode.react';

export default function BookingConfirmation() {
  const { reference } = useParams();
  const [booking, setBooking] = useState(null);
  useEffect(() => {
    let stop = false;
    const load = () => api.get(`/bookings/${reference}`).then((r) => { if (!stop) setBooking(r.data); }).catch(console.error);
    load();
    const id = setInterval(() => {
      if (stop) return;
      if (!booking || booking.status === 'pending') load();
    }, 2500);
    return () => { stop = true; clearInterval(id); };
  }, [reference]);
  if (!booking) return <p>Loading...</p>;
  return (
    <div className="card">
      <h1>Booking {booking.booking_reference}</h1>
      <p>Status: {booking.status}</p>
      <p>Total: {(booking.total_minor/100).toFixed(2)} {booking.currency}</p>
      <h3>Tickets</h3>
      <div className="grid">
        {booking.tickets?.map((t) => (
          <div className="card" key={t.id}>
            <p>{t.ticket_reference} — {t.status}</p>
            <QRCodeSVG value={t.ticket_reference} size={128} />
          </div>
        ))}
      </div>
    </div>
  );
}
