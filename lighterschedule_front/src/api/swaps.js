import apiClient from './client';

export const getSwaps = (params = {}) =>
  apiClient.get('/swaps/', { params }).then((response) => response.data);

export const createSwap = (data) =>
  apiClient.post('/swaps/', data);

export const acceptSwap = (id) =>
  apiClient.post(`/swaps/${id}/accept/`);

export const rejectSwap = (id, data = {}) =>
  apiClient.post(`/swaps/${id}/reject/`, data);

export const approveSwap = (id) =>
  apiClient.post(`/swaps/${id}/approve/`);
