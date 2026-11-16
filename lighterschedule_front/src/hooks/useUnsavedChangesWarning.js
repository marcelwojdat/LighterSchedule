import { useEffect } from 'react';

/**
 * Asks the browser to confirm leaving the page (closing the tab, reloading, typing another
 * address) while `hasChanges` is true. Browsers show their own text; a custom one is ignored.
 *
 * The listener exists only while there is something to lose: a registered `beforeunload`
 * turns off the instant back/forward cache in some browsers, so it isn't kept on all the time.
 * Links inside the app are not covered (that would need a data router with useBlocker).
 */
export const useUnsavedChangesWarning = (hasChanges) => {
  useEffect(() => {
    if (!hasChanges) return undefined;

    const warn = (event) => {
      event.preventDefault();
      event.returnValue = ''; // still required by older Safari and Chrome before 119
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges]);
};
