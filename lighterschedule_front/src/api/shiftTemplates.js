import apiClient from './client';

export const getShiftTemplates = (params = {}) =>
  apiClient.get('/shift-templates/', { params }).then((response) => response.data);

export const createShiftTemplate = (data) =>
  apiClient.post('/shift-templates/', data).then((response) => response.data);

export const updateShiftTemplate = (id, data) =>
  apiClient.put(`/shift-templates/${id}/`, data).then((response) => response.data);

export const deleteShiftTemplate = (id) =>
  apiClient.delete(`/shift-templates/${id}/`);
