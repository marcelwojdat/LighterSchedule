import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'lighterschedule-theme';

export const initTheme = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
};

export const useTheme = () => {
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'dark',
  );

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    localStorage.setItem(STORAGE_KEY, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const toggleTheme = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  return { darkMode, toggleTheme };
};
