import apiClient from './client';

export const getRejectionReasons = (params = {}) =>
  apiClient.get('/rejection-reasons/', { params }).then((response) => response.data);

export const createRejectionReason = (data) =>
  apiClient.post('/rejection-reasons/', data).then((response) => response.data);

export const deleteRejectionReason = (id) =>
  apiClient.delete(`/rejection-reasons/${id}/`);
