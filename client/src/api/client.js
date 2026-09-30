const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';

export class ApiError extends Error {
  constructor(message, status = 500, errors = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

// Token management helpers for resilient cross-site authentication
const TOKEN_KEY = 'opsync_token';

export const getStoredToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch (e) {
    return null;
  }
};

export const setStoredToken = (token) => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch (e) {}
};

export const removeStoredToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (e) {}
};

export const apiClient = async (endpoint, options = {}) => {
  const {
    method = 'GET',
    body,
    headers = {},
    credentials = 'include',
    ...restOptions
  } = options;

  const url = `${API_BASE_URL}${endpoint}`;

  const token = getStoredToken();
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  const config = {
    method,
    headers: defaultHeaders,
    credentials,
    ...restOptions,
  };

  if (body) {
    config.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  try {
    const response = await fetch(url, config);

    let data = null;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    }

    if (!response.ok) {
      const errorMessage = data?.message || `HTTP Error ${response.status}: ${response.statusText}`;
      throw new ApiError(errorMessage, response.status, data?.errors || null);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Network or parser error
    throw new ApiError(error.message || 'Unable to connect to the server. Please check your network.', 0);
  }
};
