import { apiClient } from './client.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export const filesApi = {
  getTaskFiles: async (taskId) => {
    return apiClient(`/api/files/tasks/${taskId}`, { method: 'GET' });
  },

  uploadTaskFile: async (taskId, file) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/files`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'File upload failed.');
    }
    return data;
  },

  uploadChatFile: async (roomId, file) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE_URL}/api/chats/${roomId}/files`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Chat attachment upload failed.');
    }
    return data;
  },

  downloadFileUrl: (fileId) => {
    return `${API_BASE_URL}/api/files/${fileId}/download`;
  },

  deleteFile: async (fileId) => {
    return apiClient(`/api/files/${fileId}`, { method: 'DELETE' });
  },
};
