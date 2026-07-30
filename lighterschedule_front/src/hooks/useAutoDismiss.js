import { useEffect } from 'react';

/** Clears a string message after `ms` milliseconds (default 7s). */
export const useAutoDismiss = (value, clearFn, ms = 7000) => {
  useEffect(() => {
    if (!value) return undefined;
    const timer = setTimeout(() => clearFn(''), ms);
    return () => clearTimeout(timer);
  }, [value, clearFn, ms]);
};
