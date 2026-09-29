import { apiClient } from './client.js';

export const userApi = {
  getMyProfile: async () => {
    return apiClient('/api/users/me', {
      method: 'GET',
    });
  },

  updateMyProfile: async (data) => {
    return apiClient('/api/users/me', {
      method: 'PATCH',
      body: data,
    });
  },
};
