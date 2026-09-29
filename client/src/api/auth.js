import { apiClient } from './client.js';

export const authApi = {
  register: async (payload) => {
    return apiClient('/api/auth/register', {
      method: 'POST',
      body: payload,
    });
  },

  login: async (credentials) => {
    return apiClient('/api/auth/login', {
      method: 'POST',
      body: credentials,
    });
  },

  logout: async () => {
    return apiClient('/api/auth/logout', {
      method: 'POST',
    });
  },

  getMe: async () => {
    return apiClient('/api/auth/me', {
      method: 'GET',
    });
  },

  forgotPassword: async (email) => {
    return apiClient('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  },

  resetPassword: async (token, password) => {
    return apiClient(`/api/auth/reset-password/${token}`, {
      method: 'POST',
      body: { password },
    });
  },

  changePassword: async (payload) => {
    return apiClient('/api/auth/change-password', {
      method: 'POST',
      body: payload,
    });
  },
};
