import apiClient from './client';

export const getSubscription = () =>
  apiClient.get('/subscription/').then((response) => response.data);
