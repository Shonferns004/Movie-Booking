import { useEffect, useRef } from 'react';
import QRCodeStyling from 'qr-code-styling';

/**
 * Branded QR: rounded ink dots, extra-rounded corners with a kokum accent and a
 * small gold “KS” monogram in the middle (error correction level H keeps it
 * scannable). Rendered as SVG so it stays crisp in print/PDF.
 */

const LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
     <circle cx="36" cy="36" r="34" fill="#F4B63F"/>
     <circle cx="36" cy="36" r="30" fill="none" stroke="#0A2A31" stroke-opacity=".22" stroke-width="2"/>
     <text x="36" y="45" font-family="Georgia, 'Times New Roman', serif" font-size="26" font-weight="700" text-anchor="middle" fill="#0A2A31">KS</text>
   </svg>`,
)}`;

export default function StyledQr({
  value,
  size = 128,
  accent = '#C61D23',
  background = '#FFFDF7',
  margin = 6,
  logo = false,
}) {
  const mount = useRef(null);

  useEffect(() => {
    const node = mount.current;
    if (!node || !value) return undefined;

    const qr = new QRCodeStyling({
      type: 'svg',
      width: size,
      height: size,
      data: value,
      margin,
      // With no centre logo a medium level is enough and keeps the code sparser,
      // which scans faster. The logo needs the extra redundancy.
      qrOptions: { errorCorrectionLevel: logo ? 'H' : 'M' },
      backgroundOptions: { color: background },
      dotsOptions: {
        type: 'rounded',
        gradient: {
          type: 'linear',
          rotation: Math.PI / 4,
          colorStops: [
            { offset: 0, color: '#0A2A31' },
            { offset: 1, color: '#174A54' },
          ],
        },
      },
      cornersSquareOptions: { type: 'extra-rounded', color: '#0A2A31' },
      cornersDotOptions: { type: 'dot', color: accent },
      ...(logo
        ? {
            imageOptions: {
              hideBackgroundDots: true,
              imageSize: 0.28,
              margin: 3,
              crossOrigin: 'anonymous',
            },
            image: LOGO,
          }
        : {}),
    });

    node.replaceChildren();
    qr.append(node);

    const svg = node.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
      svg.style.display = 'block';
    }

    return () => node.replaceChildren();
  }, [value, size, accent, background, margin, logo]);

  return (
    <div
      ref={mount}
      role="img"
      aria-label={`Gate QR ${value || ''}`}
      style={{ width: size, height: size }}
    />
  );
}
