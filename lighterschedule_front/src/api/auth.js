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

export const register = async (username, password) => {
  const { data } = await axios.post(`${API_BASE_URL}/register/`, { username, password });
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
