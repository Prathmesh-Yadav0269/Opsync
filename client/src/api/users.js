import { apiClient } from './client.js';

export const usersApi = {
  getUsers: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/api/users?${query}` : '/api/users';
    return apiClient(endpoint, { method: 'GET' });
  },

  getUserById: async (id) => {
    return apiClient(`/api/users/${id}`, { method: 'GET' });
  },

  createUser: async (payload) => {
    return apiClient('/api/users', {
      method: 'POST',
      body: payload,
    });
  },

  updateUser: async (id, payload) => {
    return apiClient(`/api/users/${id}`, {
      method: 'PATCH',
      body: payload,
    });
  },

  updateUserStatus: async (id, isActive) => {
    return apiClient(`/api/users/${id}/status`, {
      method: 'PATCH',
      body: { isActive },
    });
  },

  deleteUser: async (id) => {
    return apiClient(`/api/users/${id}`, {
      method: 'DELETE',
    });
  },

  getMyProfile: async () => {
    return apiClient('/api/users/me', { method: 'GET' });
  },

  updateMyProfile: async (payload) => {
    return apiClient('/api/users/me', {
      method: 'PATCH',
      body: payload,
    });
  },

  getMySettings: async () => {
    return apiClient('/api/users/settings', { method: 'GET' });
  },

  updateMySettings: async (payload) => {
    return apiClient('/api/users/settings', {
      method: 'PATCH',
      body: payload,
    });
  },

  changePassword: async ({ currentPassword, newPassword }) => {
    return apiClient('/api/users/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
  },

  uploadAvatar: async (formData) => {
    return apiClient('/api/users/avatar', {
      method: 'POST',
      body: formData,
    });
  },
};
