import React, { useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ThemeContext, type Theme, type ThemeContextType } from './ThemeContextDefinition';

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // Initialize theme from localStorage or default to 'system'
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem('hospital-theme') as Theme) || 'system';
  });

  // Calculate effective theme based on system preference
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');

  // Update effective theme when theme changes or system preference changes
  useEffect(() => {
    const updateEffectiveTheme = () => {
      if (theme === 'system') {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setEffectiveTheme(systemDark ? 'dark' : 'light');
      } else {
        setEffectiveTheme(theme);
      }
    };

    updateEffectiveTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        updateEffectiveTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;

    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        'content',
        effectiveTheme === 'dark' ? '#1f2937' : '#ffffff'
      );
    }
  }, [effectiveTheme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('hospital-theme', newTheme);
  };

  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };

  const value: ThemeContextType = {
    theme,
    effectiveTheme,
    setTheme,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};


// Theme toggle component
export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('ThemeToggle must be used within a ThemeProvider');
  }
  const { theme, effectiveTheme, toggleTheme } = context;

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return '☀️';
      case 'dark':
        return '🌙';
      case 'system':
        return '💻';
      default:
        return '☀️';
    }
  };

  const getThemeLabel = () => {
    switch (theme) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      case 'system':
        return `System (${effectiveTheme})`;
      default:
        return 'Light';
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className={`
        inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
        bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600
        text-gray-700 dark:text-gray-200 transition-colors duration-200
        ${className}
      `}
      title={`Current theme: ${getThemeLabel()}. Click to cycle themes.`}
    >
      <span className="text-base">{getThemeIcon()}</span>
      <span className="hidden sm:inline">{getThemeLabel()}</span>
    </button>
  );
};