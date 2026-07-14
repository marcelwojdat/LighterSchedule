import apiClient from './client';

export const getTeamStats = (month) =>
  apiClient.get('/stats/', { params: { month } }).then((response) => response.data);
