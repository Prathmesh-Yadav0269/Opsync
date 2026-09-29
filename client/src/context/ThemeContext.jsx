import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usersApi } from '../api/users.js';

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  // 1. Initial cached preference
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem('opsync_theme') || 'system';
    } catch {
      return 'system';
    }
  });

  // Calculate actual applied theme ('light' or 'dark')
  const getEffectiveTheme = useCallback((targetTheme) => {
    if (targetTheme === 'system') {
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'light';
    }
    return targetTheme;
  }, []);

  const [effectiveTheme, setEffectiveTheme] = useState(() => getEffectiveTheme(theme));

  // Apply 'dark' class strictly to document.documentElement
  const applyTheme = useCallback((themeToApply) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const effective = getEffectiveTheme(themeToApply);

    setEffectiveTheme(effective);

    if (effective === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [getEffectiveTheme]);

  // Set theme: updates UI immediately, updates localStorage, and conditionally persists to MongoDB
  const setTheme = useCallback(async (newTheme, skipServerPersist = false) => {
    if (!['light', 'dark', 'system'].includes(newTheme)) return;

    setThemeState(newTheme);
    try {
      localStorage.setItem('opsync_theme', newTheme);
    } catch (e) {
      // localStorage disabled / private mode
    }
    applyTheme(newTheme);

    // If not triggered by server hydration, persist to user's MongoDB record
    if (!skipServerPersist) {
      try {
        await usersApi.updateMySettings({ theme: newTheme });
      } catch (err) {
        // User may be unauthenticated (guest on login page); fail silently
      }
    }
  }, [applyTheme]);

  // Handle OS dark mode preference changes when theme === 'system'
  useEffect(() => {
    applyTheme(theme);

    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleMediaChange = () => {
      // Only react if active mode is 'system'
      setThemeState((current) => {
        if (current === 'system') {
          applyTheme('system');
        }
        return current;
      });
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
      return () => mediaQuery.removeEventListener('change', handleMediaChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleMediaChange);
      return () => mediaQuery.removeListener(handleMediaChange);
    }
  }, [theme, applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, effectiveTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
