import { apiClient } from './client.js';

export const workSessionsApi = {
  startSession: async (taskId) => {
    return apiClient('/api/work-sessions/start', {
      method: 'POST',
      body: { taskId },
    });
  },

  getCurrentSession: async () => {
    return apiClient('/api/work-sessions/current', { method: 'GET' });
  },

  getRecentSessions: async () => {
    return apiClient('/api/work-sessions/recent', { method: 'GET' });
  },

  pauseSession: async (id) => {
    return apiClient(`/api/work-sessions/${id}/pause`, { method: 'PATCH' });
  },

  resumeSession: async (id) => {
    return apiClient(`/api/work-sessions/${id}/resume`, { method: 'PATCH' });
  },

  stopSession: async (id) => {
    return apiClient(`/api/work-sessions/${id}/stop`, { method: 'PATCH' });
  },
};
