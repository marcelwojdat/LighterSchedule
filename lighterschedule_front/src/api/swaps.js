import apiClient from './client';

export const getSwaps = (params = {}) =>
  apiClient.get('/swaps/', { params }).then((response) => response.data);

export const createSwap = (data) =>
  apiClient.post('/swaps/', data).then((response) => response.data);

export const acceptSwap = (id) =>
  apiClient.post(`/swaps/${id}/accept/`).then((response) => response.data);

export const rejectSwap = (id, data = {}) =>
  apiClient.post(`/swaps/${id}/reject/`, data).then((response) => response.data);

export const approveSwap = (id) =>
  apiClient.post(`/swaps/${id}/approve/`).then((response) => response.data);
