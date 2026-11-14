import { useEffect, useRef } from 'react';

/**
 * Subscribes to the API's realtime channel.
 *
 * The server holds the single Neon Realtime subscription (Neon's client is JS-only and
 * the Flutter apps cannot use it) and pushes `{ type: 'change', topic }`. Topics are
 * `catalog`, `seats`, `payments` and `community`. No row data travels over this socket:
 * listeners simply refetch what they already know how to load.
 */
const SOCKET_URL = (() => {
  const explicit = import.meta.env.VITE_REALTIME_URL;
  if (explicit) return explicit;
  const base = import.meta.env.VITE_API_BASE_URL || '';
  if (!base) return '';
  return `${base.replace(/^http/, 'ws')}/api/v1/realtime`;
})();

/**
 * @param {string[]|string} topics topics to listen for (empty = all)
 * @param {(topic: string) => void} onEvent called when one of them changes
 */
export function useRealtime(topics, onEvent) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  const key = Array.isArray(topics) ? topics.join(',') : String(topics || '');

  useEffect(() => {
    if (!SOCKET_URL) return undefined;

    let socket = null;
    let retry = null;
    let closed = false;
    let attempt = 0;

    const schedule = () => {
      if (closed) return;
      attempt = Math.min(attempt + 1, 6);
      const delay = [2000, 4000, 8000, 16000, 30000, 30000][attempt - 1];
      retry = setTimeout(connect, delay);
    };

    function connect() {
      if (closed) return;
      const token = localStorage.getItem('token');
      const url = token ? `${SOCKET_URL}?token=${encodeURIComponent(token)}` : SOCKET_URL;
      try {
        socket = new WebSocket(url);
      } catch {
        schedule();
        return;
      }

      socket.onopen = () => {
        attempt = 0;
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message?.type !== 'change') return;
          if (key && !key.split(',').includes(message.topic)) return;
          handler.current?.(message.topic);
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = schedule;
      socket.onerror = () => {
        try {
          socket.close();
        } catch {
          /* already closed */
        }
      };
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      try {
        socket?.close();
      } catch {
        /* already closed */
      }
    };
  }, [key]);
}

export default useRealtime;
