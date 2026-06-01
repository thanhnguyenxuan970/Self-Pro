import { useSettingsContext, AppLanguage } from '../contexts/SettingsContext';

export type { AppLanguage };

export function useDarkMode(): [boolean, (v: boolean) => void] {
  const { isDark, setDarkMode } = useSettingsContext();
  return [isDark, setDarkMode];
}

export function useLanguage(): [AppLanguage, (v: AppLanguage) => void] {
  const { lang, setLanguage } = useSettingsContext();
  return [lang, setLanguage];
}
