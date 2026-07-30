import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Tracks which list entries were dismissed (manual or after `ms`).
 * `getKey(entry, index)` must be stable for the same logical item.
 */
export const useDismissibleList = (entries, getKey, ms = 7000) => {
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

  const visibleKeys = visible.map(({ key }) => key).join('\0');

  useEffect(() => {
    if (!visibleKeys) return undefined;
    const keys = visibleKeys.split('\0').filter(Boolean);
    const timers = keys.map((key) => setTimeout(() => dismiss(key), ms));
    return () => timers.forEach(clearTimeout);
  }, [visibleKeys, dismiss, ms]);

  return { visible, dismiss };
};
