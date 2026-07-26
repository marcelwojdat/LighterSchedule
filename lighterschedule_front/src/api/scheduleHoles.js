import apiClient from './client';

export const getScheduleHoles = (params = {}) =>
  apiClient.get('/schedule-holes/', { params }).then((response) => response.data);
