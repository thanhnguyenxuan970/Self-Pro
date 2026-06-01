import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseSettingsBool, parseSettingsLang } from '../logic/settingsLogic';

export type AppLanguage = 'vi' | 'en';

const DARK_MODE_KEY = 'habit_dark_mode';
const LANGUAGE_KEY = 'habit_language';

type SettingsContextType = {
  isDark: boolean;
  lang: AppLanguage;
  setDarkMode: (v: boolean) => void;
  setLanguage: (v: AppLanguage) => void;
};

const SettingsContext = createContext<SettingsContextType>({
  isDark: false,
  lang: 'vi',
  setDarkMode: () => {},
  setLanguage: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [lang, setLang] = useState<AppLanguage>('vi');

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(DARK_MODE_KEY),
      AsyncStorage.getItem(LANGUAGE_KEY),
    ])
      .then(([darkVal, langVal]) => {
        setIsDark(parseSettingsBool(darkVal));
        setLang(parseSettingsLang(langVal));
      })
      .catch((e) => { console.warn('[SettingsContext] failed to load settings', e); });
  }, []);

  const setDarkMode = useCallback((v: boolean) => {
    setIsDark(v);
    AsyncStorage.setItem(DARK_MODE_KEY, v ? 'true' : 'false').catch(() => {});
  }, []);

  const setLanguage = useCallback((v: AppLanguage) => {
    setLang(v);
    AsyncStorage.setItem(LANGUAGE_KEY, v).catch(() => {});
  }, []);

  return (
    <SettingsContext.Provider value={{ isDark, lang, setDarkMode, setLanguage }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext() {
  return useContext(SettingsContext);
}
