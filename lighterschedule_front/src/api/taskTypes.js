import apiClient from './client';

export const getTaskTypes = () =>
  apiClient.get('/task-types/').then((response) => response.data);
