import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const money = (minor = 0) => `₹${(Number(minor || 0) / 100).toFixed(2)}`;

function showTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Builds a printable ticket PDF: one page header, booking details and a QR per seat.
 *
 * @param {{ booking: object, seats: object[], tickets: object[] }} data
 * @returns {Promise<Buffer>}
 */
export async function buildTicketPdf({ booking, seats = [], tickets = [] }) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 42,
    info: { Title: `Konkani Samudai tickets ${booking.booking_reference}` },
  });

  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Header band.
  doc.rect(0, 0, 595, 112).fill('#1E2227');
  doc.fill('#C8FF1F').font('Helvetica-Bold').fontSize(22).text('KONKANI SAMUDAI', 42, 34);
  doc.fill('#F2F0EC').font('Helvetica').fontSize(9).text('CINEMA & SCREENHOUSE', 42, 64);
  doc.fill('#F2F0EC').fontSize(10).text(`Booking ${booking.booking_reference}`, 42, 82);

  doc.fillColor('#1E2227').font('Helvetica-Bold').fontSize(20)
    .text(booking.movie_title || 'Movie screening', 42, 142, { width: 511 });
  doc.fillColor('#3A4148').font('Helvetica').fontSize(10);
  doc.text(showTime(booking.starts_at), 42, 176);
  doc.text(`${booking.theatre_name || ''}${booking.auditorium_name ? ` · ${booking.auditorium_name}` : ''}`, 42, 192);
  doc.text(
    [booking.language, booking.certification].filter(Boolean).join(' · '),
    42,
    208,
  );

  const seatLabels = seats.map((seat) => seat.seat_label).filter(Boolean);
  doc.text(`Seats: ${seatLabels.join(', ') || '—'}`, 42, 228);
  doc.text(`Order total: ${money(booking.total_minor)}`, 42, 244);

  doc.moveTo(42, 268).lineTo(553, 268).strokeColor('#B5AFA6').lineWidth(1).stroke();

  let y = 292;
  for (const ticket of tickets) {
    if (y > 700) {
      doc.addPage();
      y = 60;
    }

    let qr = null;
    try {
      qr = await QRCode.toBuffer(ticket.ticket_reference, { type: 'png', margin: 1, width: 150 });
    } catch {
      qr = null;
    }
    if (qr) doc.image(qr, 42, y, { width: 110 });

    doc.fillColor('#1E2227').font('Helvetica-Bold').fontSize(12)
      .text(`Seat ${ticket.seat_label || ''}`, 172, y + 16);
    doc.fillColor('#5A6158').font('Helvetica').fontSize(9)
      .text(ticket.category_name || 'Standard', 172, y + 34);
    doc.fillColor('#8C877F').font('Helvetica').fontSize(8)
      .text(ticket.ticket_reference || '', 172, y + 50);

    y += 126;
  }

  doc.fillColor('#B5AFA6').font('Helvetica').fontSize(8)
    .text('Show this PDF at the entrance. Each QR code is valid for one seat.',
      42, 790, { width: 511, align: 'center' });

  doc.end();
  return finished;
}

export default buildTicketPdf;
