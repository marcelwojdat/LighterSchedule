import axios from 'axios';
import { API_BASE_URL, clearSession, refreshAccessToken } from './client';
import { getCurrentUser } from './users';

export const login = async (username, password) => {
  const { data } = await axios.post(`${API_BASE_URL}/token/`, { username, password });
  if (data.access) {
    localStorage.setItem('access', data.access);
    localStorage.setItem('refresh', data.refresh);
  }
  return data;
};

/** Creates a new organization with the registering user as its manager. */
export const register = async (payload) => {
  const { data } = await axios.post(`${API_BASE_URL}/register/`, payload);
  return data;
};

export const logout = () => {
  clearSession();
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
