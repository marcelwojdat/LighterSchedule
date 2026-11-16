import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Tracks which list entries were dismissed (manually, or automatically one after another:
 * the first after `ms`, each next one `stepMs` later).
 * `getKey(entry, index)` must be stable for the same logical item.
 */
export const useDismissibleList = (entries, getKey, ms = 7000, stepMs = 3000) => {
  const [dismissed, setDismissed] = useState(() => new Set());

  const dismiss = useCallback((key) => {
    setDismissed((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const visible = useMemo(() => {
    const list = Array.isArray(entries) ? entries : [];
    return list
      .map((entry, index) => ({ entry, key: getKey(entry, index) }))
      .filter(({ key }) => key && !dismissed.has(key));
  }, [entries, dismissed, getKey]);

  // One timer for the whole queue, always on the first visible entry. Entries added at the end
  // or closed in the middle don't touch it, so the countdown of the first one never restarts.
  const headKey = visible[0]?.key;
  const queueRunningRef = useRef(false);

  useEffect(() => {
    if (!headKey) {
      queueRunningRef.current = false; // the next batch gets the full reading time again
      return undefined;
    }
    const timer = setTimeout(() => {
      queueRunningRef.current = true;
      dismiss(headKey);
    }, queueRunningRef.current ? stepMs : ms);
    return () => clearTimeout(timer);
  }, [headKey, dismiss, ms, stepMs]);

  return { visible, dismiss };
};
