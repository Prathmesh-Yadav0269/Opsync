import { apiClient } from './client.js';

export const teamsApi = {
  getTeams: async () => {
    return apiClient('/api/teams', { method: 'GET' });
  },

  getTeamById: async (id) => {
    return apiClient(`/api/teams/${id}`, { method: 'GET' });
  },

  createTeam: async (payload) => {
    return apiClient('/api/teams', {
      method: 'POST',
      body: payload,
    });
  },

  updateTeam: async (id, payload) => {
    return apiClient(`/api/teams/${id}`, {
      method: 'PATCH',
      body: payload,
    });
  },

  toggleArchiveTeam: async (id) => {
    return apiClient(`/api/teams/${id}/archive`, {
      method: 'PATCH',
    });
  },

  deleteTeam: async (id) => {
    return apiClient(`/api/teams/${id}`, {
      method: 'DELETE',
    });
  },

  addMember: async (teamId, userId) => {
    return apiClient(`/api/teams/${teamId}/members`, {
      method: 'POST',
      body: { userId },
    });
  },

  removeMember: async (teamId, userId) => {
    return apiClient(`/api/teams/${teamId}/members/${userId}`, {
      method: 'DELETE',
    });
  },
};
