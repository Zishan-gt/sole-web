import React, { createContext, useContext, useEffect, useState } from 'react';
import type { SupportedLocale } from '../config/brand';

interface ThemeContextValue {
  dark: boolean;
  toggleTheme: () => void;
  locale: SupportedLocale;
  setLocale: (loc: SupportedLocale) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  dark: false,
  toggleTheme: () => {},
  locale: 'en',
  setLocale: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dark, setDark] = useState(() => localStorage.getItem('soleweb_theme') === 'dark');
  const [locale, setLocaleState] = useState<SupportedLocale>(() =>
    localStorage.getItem('soleweb_locale') === 'hi' ? 'hi' : 'en'
  );

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
      localStorage.setItem('soleweb_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('soleweb_theme', 'light');
    }
  }, [dark]);

  const setLocale = (loc: SupportedLocale) => {
    setLocaleState(loc);
    localStorage.setItem('soleweb_locale', loc);
  };

  return (
    <ThemeContext.Provider
      value={{
        dark,
        toggleTheme: () => setDark((d) => !d),
        locale,
        setLocale,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
