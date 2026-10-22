import http from 'node:http';

/** Headers that describe a single connection and must not be forwarded. */
const HOP_BY_HOP = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'];

/**
 * Minimal reverse proxy used to expose the embedded YouPI PG gateway
 * (payment core + checkout portal) through the movie API's own port.
 *
 * The gateway services keep their native HTTP servers on loopback; this proxy
 * is the only public entry point, so the whole app runs on a single port.
 *
 * The request body is streamed through untouched, so this must be mounted before
 * any body-parsing middleware (the gateway parses its own JSON payloads).
 */
export function createProxy({ target, port, stripPrefix = '', hostHeader }) {
  return function proxyMiddleware(req, res, next) {
    let pathname = req.url;
    if (stripPrefix && pathname.startsWith(stripPrefix)) {
      pathname = pathname.slice(stripPrefix.length) || '/';
    }

    const headers = { ...req.headers };
    for (const header of HOP_BY_HOP) delete headers[header];
    delete headers.host;
    delete headers['content-length'];
    if (hostHeader) headers['x-forwarded-host'] = hostHeader;
    headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || 'http';
    headers['x-forwarded-for'] = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

    const upstream = http.request(
      { hostname: target, port, path: pathname, method: req.method, headers },
      (upstreamRes) => {
        const outHeaders = { ...upstreamRes.headers };
        // The gateway's own preflight does not list the merchant header the SDK sends.
        if (outHeaders['access-control-allow-headers']) {
          outHeaders['access-control-allow-headers'] = `${outHeaders['access-control-allow-headers']}, X-Merchant-Id, X-Merchant-Key`;
        }
        res.writeHead(upstreamRes.statusCode || 502, outHeaders);
        upstreamRes.pipe(res);
      }
    );

    upstream.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payment gateway unavailable', details: err.message }));
      } else {
        res.end();
      }
    });

    res.on('close', () => {
      // Client went away mid-flight: stop talking to the gateway as well.
      if (!res.writableEnded) upstream.destroy();
    });
    req.pipe(upstream);
  };
}
