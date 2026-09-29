import { apiClient } from './client.js';

export const meetingsApi = {
  createMeeting: async ({ title, teamId, participantIds }) => {
    return apiClient('/api/meetings', {
      method: 'POST',
      body: { title, teamId, participantIds },
    });
  },

  getMeetings: async () => {
    return apiClient('/api/meetings', { method: 'GET' });
  },

  getMeetingById: async (id) => {
    return apiClient(`/api/meetings/${id}`, { method: 'GET' });
  },

  endMeeting: async (id) => {
    return apiClient(`/api/meetings/${id}/end`, { method: 'PATCH' });
  },
};
