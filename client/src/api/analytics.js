import { apiClient } from './client.js';

export const analyticsApi = {
  getMyAnalytics: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiClient(`/api/analytics/me${query ? `?${query}` : ''}`, { method: 'GET' });
  },

  getMyHeatmap: async (year) => {
    const query = year ? `?year=${year}` : '';
    return apiClient(`/api/analytics/me/heatmap${query}`, { method: 'GET' });
  },

  getTeamAnalytics: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiClient(`/api/analytics/team${query ? `?${query}` : ''}`, { method: 'GET' });
  },

  getTeamMemberAnalytics: async (userId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiClient(`/api/analytics/team/members/${userId}${query ? `?${query}` : ''}`, {
      method: 'GET',
    });
  },

  getAdminAnalytics: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiClient(`/api/analytics/admin${query ? `?${query}` : ''}`, { method: 'GET' });
  },
};
