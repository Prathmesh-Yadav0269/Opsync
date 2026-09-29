import { apiClient } from './client.js';

export const tasksApi = {
  getTasks: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/api/tasks?${query}` : '/api/tasks';
    return apiClient(endpoint, { method: 'GET' });
  },

  getTaskById: async (id) => {
    return apiClient(`/api/tasks/${id}`, { method: 'GET' });
  },

  createTask: async (payload) => {
    return apiClient('/api/tasks', {
      method: 'POST',
      body: payload,
    });
  },

  updateTask: async (id, payload) => {
    return apiClient(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: payload,
    });
  },

  updateTaskStatus: async (id, status) => {
    return apiClient(`/api/tasks/${id}/status`, {
      method: 'PATCH',
      body: { status },
    });
  },

  addComment: async (id, content) => {
    return apiClient(`/api/tasks/${id}/comments`, {
      method: 'POST',
      body: { content },
    });
  },

  deleteTask: async (id) => {
    return apiClient(`/api/tasks/${id}`, {
      method: 'DELETE',
    });
  },
};
