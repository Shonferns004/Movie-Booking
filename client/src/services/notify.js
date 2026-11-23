import { sileo } from 'sileo';

/**
 * Site-wide notifications.
 *
 * Thin wrapper around Sileo so every screen shares the same look and copy rules:
 * - `success` / `error` / `info` take a title plus an optional description.
 * - `promise` shows a loading toast that resolves into success or error.
 *
 * Toasts never throw: a notification failure must not break a booking.
 */
const BASE = {
  duration: 4200,
  fill: '#2E353D',
  roundness: 18,
  // Expand immediately and stay open for reading (Sileo's resting state is a pill).
  autopilot: { expand: 0, collapse: 60000 },
};

function fire(type, options) {
  const payload = typeof options === 'string' ? { title: options } : { ...options };
  try {
    return sileo[type]({ ...BASE, ...payload });
  } catch {
    return null;
  }
}

export const notify = {
  success: (options) => fire('success', options),
  error: (options) => fire('error', options),
  warning: (options) => fire('warning', options),
  info: (options) => fire('info', options),
  loading: (options) => fire('loading', { duration: null, ...(typeof options === 'string' ? { title: options } : options) }),
  dismiss: (id) => {
    try { sileo.dismiss(id); } catch { /* noop */ }
  },
  clear: () => {
    try { sileo.clear(); } catch { /* noop */ }
  },
  promise: (promise, messages) => sileo.promise(promise, {
    loading: { ...BASE, duration: null, ...messages.loading },
    success: (data) => ({ ...BASE, ...(typeof messages.success === 'function' ? messages.success(data) : messages.success) }),
    error: (error) => ({
      ...BASE,
      ...(typeof messages.error === 'function'
        ? messages.error(error)
        : { title: 'Something went wrong', description: messages.error?.title || error?.message }),
    }),
  }),
};

/** Split an API/validation message into a short title and the full detail. */
export function splitMessage(message, fallbackTitle = 'Something went wrong') {
  const text = String(message || '').trim();
  if (!text) return { title: fallbackTitle };
  const [first, ...rest] = text.split(/[.!?]\s+/);
  return {
    title: first.length > 64 ? fallbackTitle : first,
    description: first.length > 64 || rest.length ? text : undefined,
  };
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__sileo = notify;
}

export default notify;
