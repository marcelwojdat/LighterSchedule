import axios from 'axios';

export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

export const refreshAccessToken = async () => {
  const refresh = localStorage.getItem('refresh');
  if (!refresh) {
    throw new Error('Sesja wygasła. Zaloguj się ponownie.');
  }

  const { data } = await axios.post(`${API_BASE_URL}/token/refresh/`, { refresh });
  if (!data.access) {
    throw new Error('Sesja wygasła. Zaloguj się ponownie.');
  }

  localStorage.setItem('access', data.access);
  return data.access;
};

export const clearSession = () => {
  localStorage.removeItem('access');
  localStorage.removeItem('refresh');
};

export const getErrorMessage = (error, fallback = 'Wystąpił nieoczekiwany błąd.') => {
  const data = error.response?.data;
  if (!data) {
    return error.message || fallback;
  }
  if (typeof data === 'string') {
    return data;
  }
  if (data.error) {
    return data.error;
  }
  if (data.detail) {
    return data.detail;
  }

  const firstKey = Object.keys(data)[0];
  if (firstKey) {
    const value = data[firstKey];
    if (Array.isArray(value)) {
      return value[0];
    }
    if (typeof value === 'string') {
      return value;
    }
  }

  return fallback;
};

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest || error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      await refreshAccessToken();
      originalRequest.headers.Authorization = `Bearer ${localStorage.getItem('access')}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      clearSession();
      window.location.href = '/login';
      return Promise.reject(refreshError);
    }
  }
);

export default apiClient;
