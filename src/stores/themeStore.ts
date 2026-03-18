import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
}

const getSystemTheme = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const resolveTheme = (theme: Theme): boolean => {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme === 'dark';
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      isDark: resolveTheme('system'),
      setTheme: (theme) => {
        set({ theme, isDark: resolveTheme(theme) });
      },
    }),
    {
      name: 'theme-storage',
    }
  )
);

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const state = useThemeStore.getState();
    if (state.theme === 'system') {
      useThemeStore.setState({ isDark: e.matches });
    }
  });
}
