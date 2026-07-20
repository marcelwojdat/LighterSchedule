import apiClient, { API_BASE_URL } from './client';

export const getTeamStats = (month) =>
  apiClient.get('/stats/', { params: { month } }).then((response) => response.data);

export const downloadPayrollPdf = async (month) => {
  const response = await apiClient.get('/stats/payroll.pdf', {
    params: { month },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `wyplaty-${month}.pdf`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  return response;
};

// Kept for debugging / absolute URL needs
export const payrollPdfUrl = (month) => `${API_BASE_URL}/stats/payroll.pdf?month=${month}`;
