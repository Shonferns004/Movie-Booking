export function errorMiddleware(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: err.message || 'Internal server error',
    details: err.details,
    requestId: req.headers['x-request-id'] || null,
  });
}
