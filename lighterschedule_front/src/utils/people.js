/** Logins are lowercase without spaces (the server stores them the same way). */
export const normalizeLogin = (value) => value.toLowerCase().replace(/\s/g, '');

/** "First Last", or the login when the account has no name. */
export const displayName = (user) =>
  `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || '';
