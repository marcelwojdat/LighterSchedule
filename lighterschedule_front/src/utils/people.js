/** "First Last", or the login when the account has no name. */
export const displayName = (user) =>
  `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || '';
