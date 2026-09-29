import { apiClient } from './client.js';

export const standupsApi = {
  getMyTodayStandup: async () => {
    return apiClient('/api/standups/me/today', { method: 'GET' });
  },

  getMyStandupByDate: async (dateStr) => {
    const query = dateStr ? `?date=${dateStr}` : '';
    return apiClient(`/api/standups/me${query}`, { method: 'GET' });
  },

  updateStandupContext: async (id, userContext) => {
    return apiClient(`/api/standups/${id}/context`, {
      method: 'PATCH',
      body: { userContext },
    });
  },

  getTeamStandup: async (dateStr) => {
    const query = dateStr ? `?date=${dateStr}` : '';
    return apiClient(`/api/standups/team${query}`, { method: 'GET' });
  },
};
