import { apiClient } from './client.js';

export const chatsApi = {
  getChats: async () => {
    return apiClient('/api/chats', { method: 'GET' });
  },

  getOrCreateDirectChat: async (userId) => {
    return apiClient(`/api/chats/direct/${userId}`, { method: 'POST' });
  },

  getTeamChat: async (teamId) => {
    return apiClient(`/api/chats/team/${teamId}`, { method: 'GET' });
  },

  getMessages: async (roomId, page = 1, limit = 30) => {
    return apiClient(`/api/chats/${roomId}/messages?page=${page}&limit=${limit}`, {
      method: 'GET',
    });
  },

  markMessagesRead: async (roomId) => {
    return apiClient(`/api/chats/${roomId}/read`, { method: 'POST' });
  },
};
