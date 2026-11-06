import axios from 'axios';
import { API_BASE_URL, clearSession, refreshAccessToken, storeTokens } from './client';
import { getCurrentUser } from './users';

const REVOKE_TIMEOUT_MS = 3000;

export const login = async (username, password) => {
  const { data } = await axios.post(`${API_BASE_URL}/token/`, { username, password });
  storeTokens(data);
  return data;
};

/** Creates a new organization with the registering user as its manager. */
export const register = async (payload) => {
  const { data } = await axios.post(`${API_BASE_URL}/register/`, payload);
  return data;
};

/** Signs out locally at once, then revokes the refresh token on the server (best effort). */
export const logout = async () => {
  const refresh = localStorage.getItem('refresh');
  clearSession();
  if (refresh) {
    await axios
      .post(`${API_BASE_URL}/token/blacklist/`, { refresh }, { timeout: REVOKE_TIMEOUT_MS })
      .catch(() => {});
  }
  window.location.href = '/login';
};

export const isAuthenticated = () => !!localStorage.getItem('access');

const Auth = {
  login,
  register,
  logout,
  isAuthenticated,
  refreshToken: refreshAccessToken,
  fetchCurrentUser: getCurrentUser,
};

export default Auth;
