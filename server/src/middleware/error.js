export function errorMiddleware(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(status).json({
    error: isProd && status >= 500 ? 'Internal server error' : (err.message || 'Internal server error'),
    details: isProd ? undefined : err.details,
    requestId: req.headers['x-request-id'] || null,
  });
}
