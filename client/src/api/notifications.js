import { apiClient } from './client.js';

export const notificationsApi = {
  getNotifications: async () => {
    return apiClient('/api/notifications', { method: 'GET' });
  },

  markRead: async (id) => {
    return apiClient(`/api/notifications/${id}/read`, { method: 'PATCH' });
  },

  markAllRead: async () => {
    return apiClient('/api/notifications/read-all', { method: 'PATCH' });
  },
};
