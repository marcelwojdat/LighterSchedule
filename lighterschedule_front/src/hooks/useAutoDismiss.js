import { useEffect } from 'react';

/** Clears a string message after `ms` milliseconds (default 10s). */
export const useAutoDismiss = (value, clearFn, ms = 10000) => {
  useEffect(() => {
    if (!value) return undefined;
    const timer = setTimeout(() => clearFn(''), ms);
    return () => clearTimeout(timer);
  }, [value, clearFn, ms]);
};
