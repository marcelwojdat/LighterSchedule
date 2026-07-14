import apiClient from './client';

export const getUsers = () =>
  apiClient.get('/users/').then((response) => response.data);

export const updateUserProfile = (userId, data) =>
  apiClient.patch(`/users/${userId}/profile/`, data).then((response) => response.data);

export const getCurrentUser = () =>
  apiClient.get('/me/').then((response) => response.data);
