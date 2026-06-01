import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DARK_MODE_KEY = 'habit_dark_mode';
const LANGUAGE_KEY = 'habit_language';

export type AppLanguage = 'vi' | 'en';

export function useDarkMode(): [boolean, (v: boolean) => Promise<void>] {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DARK_MODE_KEY)
      .then(v => { if (v === 'true') setIsDark(true); })
      .catch(() => {});
  }, []);

  const toggle = useCallback(async (v: boolean) => {
    setIsDark(v);
    await AsyncStorage.setItem(DARK_MODE_KEY, v ? 'true' : 'false');
  }, []);

  return [isDark, toggle];
}

export function useLanguage(): [AppLanguage, (v: AppLanguage) => Promise<void>] {
  const [lang, setLang] = useState<AppLanguage>('vi');

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY)
      .then(v => { if (v === 'en' || v === 'vi') setLang(v); })
      .catch(() => {});
  }, []);

  const setLanguage = useCallback(async (v: AppLanguage) => {
    setLang(v);
    await AsyncStorage.setItem(LANGUAGE_KEY, v);
  }, []);

  return [lang, setLanguage];
}
