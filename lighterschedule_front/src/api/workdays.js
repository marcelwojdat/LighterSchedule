import apiClient from './client';

export const getWorkdays = (params = {}) =>
  apiClient.get('/workdays/', { params }).then((response) => response.data);

export const createWorkday = (data) =>
  apiClient.post('/workdays/', data);

export const updateWorkday = (id, data) =>
  apiClient.patch(`/workdays/${id}/`, data);

export const deleteWorkday = (id) =>
  apiClient.delete(`/workdays/${id}/`);

export const approveWorkday = (id, data = {}) =>
  apiClient.post(`/workdays/${id}/approve/`, data);

export const rejectWorkday = (id, data = {}) =>
  apiClient.post(`/workdays/${id}/reject/`, data);

export const getCalendarFeedInfo = () =>
  apiClient.get('/workdays/calendar-feed/').then((response) => response.data);

export const copyWorkdays = (data) =>
  apiClient.post('/workdays/copy/', data).then((response) => response.data);

export const downloadWorkdaysIcs = async (params = {}) => {
  const response = await apiClient.get('/workdays/export.ics/', {
    params,
    responseType: 'blob',
  });
  const month = params.month ? `-${params.month}` : '';
  const blob = new Blob([response.data], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `grafik${month}.ics`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  return response;
};
