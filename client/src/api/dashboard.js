import { apiClient } from './client.js';

export const dashboardApi = {
  getStats: async () => {
    return apiClient('/api/dashboard/stats', { method: 'GET' });
  },
};
