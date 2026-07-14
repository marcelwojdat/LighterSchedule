import apiClient from './client';

export const getWorkdays = (params = {}) =>
  apiClient.get('/workdays/', { params }).then((response) => response.data);

export const createWorkday = (data) =>
  apiClient.post('/workdays/', data);

export const updateWorkday = (id, data) =>
  apiClient.patch(`/workdays/${id}/`, data);

export const deleteWorkday = (id) =>
  apiClient.delete(`/workdays/${id}/`);

export const approveWorkday = (id, data = {}) =>
  apiClient.post(`/workdays/${id}/approve/`, data);

export const rejectWorkday = (id, data = {}) =>
  apiClient.post(`/workdays/${id}/reject/`, data);
