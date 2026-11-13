export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function notFound(msg = 'Not found') { return new HttpError(404, msg); }
export function badRequest(msg = 'Bad request', details) { return new HttpError(400, msg, details); }
export function unauthorized(msg = 'Unauthorized') { return new HttpError(401, msg); }
export function forbidden(msg = 'Forbidden') { return new HttpError(403, msg); }
export function conflict(msg = 'Conflict') { return new HttpError(409, msg); }

/**
 * 503 for "this deployment is not wired up yet" errors. The message is safe to show in
 * production (no internals, no secrets), otherwise the error middleware masks it.
 */
export function serviceUnavailable(msg = 'Service unavailable') {
  const error = new HttpError(503, msg);
  error.expose = true;
  return error;
}
