import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/auth.js';
import { useTheme } from './ThemeContext.jsx';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { setTheme } = useTheme();

  const syncUserSettings = useCallback((userData) => {
    if (userData?.settings?.theme) {
      setTheme(userData.settings.theme, true);
    }
  }, [setTheme]);

  const refreshUser = useCallback(async () => {
    try {
      const response = await authApi.getMe();
      if (response?.data?.user) {
        setUser(response.data.user);
        syncUserSettings(response.data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [syncUserSettings]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email, password) => {
    const response = await authApi.login({ email, password });
    if (response?.data?.user) {
      setUser(response.data.user);
      syncUserSettings(response.data.user);
    }
    return response;
  };

  const register = async (name, email, password) => {
    const response = await authApi.register({ name, email, password });
    if (response?.data?.user) {
      setUser(response.data.user);
      syncUserSettings(response.data.user);
    }
    return response;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
    }
  };

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    syncUserSettings(updatedUser);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
