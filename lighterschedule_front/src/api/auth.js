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

export const getRegistrationStatus = async () => {
  const { data } = await axios.get(`${API_BASE_URL}/register/status/`);
  return data;
};

export const register = async ({
  username,
  password,
  first_name,
  last_name,
  email,
  invite_code,
}) => {
  const payload = {
    username,
    password,
    first_name,
    last_name,
    email,
  };
  if (invite_code) {
    payload.invite_code = invite_code;
  }
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
  getRegistrationStatus,
  logout,
  isAuthenticated,
  refreshToken: refreshAccessToken,
  fetchCurrentUser: getCurrentUser,
};

export default Auth;
