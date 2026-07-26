import apiClient from './client';

export const getScheduleSettings = () =>
  apiClient.get('/schedule-settings/').then((response) => response.data);

export const updateScheduleSettings = (data) =>
  apiClient.patch('/schedule-settings/', data).then((response) => response.data);
