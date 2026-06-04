import { useMemo } from 'react';
import { useSettingsContext, AppLanguage } from '../contexts/SettingsContext';
import { getColors, AppColors } from '../config/theme';
import { getTranslations, Strings } from '../config/i18n';

export type { AppLanguage };

export function useDarkMode(): [boolean, (v: boolean) => void] {
  const { isDark, setDarkMode } = useSettingsContext();
  return [isDark, setDarkMode];
}

export function useLanguage(): [AppLanguage, (v: AppLanguage) => void] {
  const { lang, setLanguage } = useSettingsContext();
  return [lang, setLanguage];
}

export function useAudioEnabled(): [boolean, (v: boolean) => void] {
  const { audioEnabled, setAudioEnabled } = useSettingsContext();
  return [audioEnabled, setAudioEnabled];
}

export function useTheme(): { colors: AppColors; isDark: boolean } {
  const { isDark } = useSettingsContext();
  return useMemo(() => ({ colors: getColors(isDark), isDark }), [isDark]);
}

export function useTranslations(): Strings {
  const { lang } = useSettingsContext();
  return useMemo(() => getTranslations(lang), [lang]);
}
