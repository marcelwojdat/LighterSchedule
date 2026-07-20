import apiClient from './client';

export const getNotifications = () =>
  apiClient.get('/notifications/').then((response) => response.data);
