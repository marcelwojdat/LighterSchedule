import apiClient from './client';

export const getTaskTypes = () =>
  apiClient.get('/task-types/').then((response) => response.data);

export const createTaskType = (data) =>
  apiClient.post('/task-types/', data).then((response) => response.data);

export const updateTaskType = (id, data) =>
  apiClient.patch(`/task-types/${id}/`, data).then((response) => response.data);

export const deleteTaskType = (id) =>
  apiClient.delete(`/task-types/${id}/`).then((response) => response.data);
