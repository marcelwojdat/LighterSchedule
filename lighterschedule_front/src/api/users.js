import apiClient from './client';

export const getUsers = () =>
  apiClient.get('/users/').then((response) => response.data);

export const updateUserProfile = (userId, data) =>
  apiClient.patch(`/users/${userId}/profile/`, data).then((response) => response.data);

export const getCurrentUser = () =>
  apiClient.get('/me/').then((response) => response.data);

export const getSwappableWorkdays = (userId) =>
  apiClient.get(`/users/${userId}/swappable-workdays/`).then((response) => response.data);

export const updateCurrentUser = (data) =>
  apiClient.patch('/me/', data).then((response) => response.data);

export const changePassword = (data) =>
  apiClient.post('/me/change-password/', data).then((response) => response.data);
