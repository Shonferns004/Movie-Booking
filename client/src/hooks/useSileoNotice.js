import { useEffect, useRef } from 'react';
import notify, { splitMessage } from '../services/notify.js';

/**
 * Mirrors an existing inline notice/error string into a Sileo toast.
 *
 * Screens already keep their own message state for layout reasons; this keeps the
 * toast in sync without rewriting every handler. It fires only when the text
 * changes, so re-renders don't spam the stack.
 */
export function useSileoNotice(value, type = 'info', options = {}) {
  const last = useRef(value);

  useEffect(() => {
    if (!value) {
      last.current = value;
      return;
    }
    if (value === last.current) return;
    last.current = value;

    const payload = splitMessage(value, options.title || 'Notice');
    if (options.description !== undefined) payload.description = options.description;

    if (type === 'error') notify.error(payload);
    else if (type === 'warning') notify.warning(payload);
    else if (type === 'success') notify.success(payload);
    else notify.info(payload);
  }, [value, type, options.title, options.description]);
}

export default useSileoNotice;
