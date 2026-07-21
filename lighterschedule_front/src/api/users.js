import apiClient from './client';

export const getUsers = () =>
  apiClient.get('/users/').then((response) => response.data);

export const createUser = (data) =>
  apiClient.post('/users/', data).then((response) => response.data);

export const updateUserProfile = (userId, data) =>
  apiClient.patch(`/users/${userId}/profile/`, data).then((response) => response.data);

/** Soft-delete (is_active=False) by default; pass { permanent: true } for hard delete when allowed. */
export const deleteUser = (userId, { permanent = false } = {}) =>
  apiClient
    .delete(`/users/${userId}/`, {
      params: permanent ? { permanent: true } : undefined,
    })
    .then((response) => response.data);

export const getCurrentUser = () =>
  apiClient.get('/me/').then((response) => response.data);

export const getSwappableWorkdays = (userId) =>
  apiClient.get(`/users/${userId}/swappable-workdays/`).then((response) => response.data);

export const updateCurrentUser = (data) =>
  apiClient.patch('/me/', data).then((response) => response.data);

export const changePassword = (data) =>
  apiClient.post('/me/change-password/', data).then((response) => response.data);
