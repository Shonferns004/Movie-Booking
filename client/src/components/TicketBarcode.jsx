import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * Scannable CODE128 barcode for a ticket reference. JsBarcode draws fixed-width
 * bars, so after render we add a viewBox and let the SVG fill its wrapper (bar
 * ratios are preserved, so it still scans). `vertical` rotates it so it can sit
 * as a slim strip on the right edge of a ticket.
 */
export default function TicketBarcode({
  value,
  height = 44,
  moduleWidth = 1.6,
  barColor = '#1E2227',
  background = 'transparent',
  vertical = false,
  className = '',
}) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !value) return;
    JsBarcode(node, String(value), {
      format: 'CODE128',
      width: moduleWidth,
      height,
      displayValue: false,
      margin: 0,
      lineColor: barColor,
      background,
    });
    const width = parseFloat(node.getAttribute('width')) || 0;
    const svgHeight = parseFloat(node.getAttribute('height')) || height;
    if (!width) return;
    node.setAttribute('viewBox', `0 0 ${width} ${svgHeight}`);
    node.removeAttribute('width');
    node.removeAttribute('height');
    node.setAttribute('preserveAspectRatio', 'none');
    node.style.display = 'block';
    if (!vertical) {
      node.style.width = '100%';
      node.style.height = '100%';
    }
  }, [value, height, moduleWidth, barColor, background, vertical]);

  return (
    <div
      className={className}
      style={vertical ? { containerType: 'size', position: 'relative' } : { height: '100%', width: '100%' }}
    >
      <svg
        ref={ref}
        role="img"
        aria-label={`Barcode ${value || 'ticket'}`}
        style={
          vertical
            ? {
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: '100cqh',
                height: '100cqw',
                maxWidth: 'none',
                transform: 'translate(-50%, -50%) rotate(90deg)',
              }
            : { width: '100%', height: '100%' }
        }
      />
    </div>
  );
}
