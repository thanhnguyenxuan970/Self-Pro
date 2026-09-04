const context = {
  isDark: true,
  lang: 'en' as const,
  audioEnabled: false,
  accent: 'rose' as const,
  setDarkMode: jest.fn(),
  setLanguage: jest.fn(),
  setAudioEnabled: jest.fn(),
  setAccent: jest.fn(),
};

jest.mock('react', () => ({
  useMemo: (factory: () => unknown) => factory(),
}));
jest.mock('../src/contexts/SettingsContext', () => ({
  useSettingsContext: () => context,
}));
jest.mock('../src/config/theme', () => ({
  getColors: jest.fn((isDark: boolean, accent: string) => ({ isDark, accent, primary: '#test' })),
}));
jest.mock('../src/config/i18n', () => ({
  getTranslations: jest.fn((language: string) => ({ language })),
}));

import { getColors } from '../src/config/theme';
import { getTranslations } from '../src/config/i18n';
import { useAccent, useAudioEnabled, useDarkMode, useLanguage, useTheme, useTranslations } from '../src/hooks/useSettings';

describe('settings hook adapters', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns each persisted setting and its setter', () => {
    expect(useDarkMode()).toEqual([true, context.setDarkMode]);
    expect(useLanguage()).toEqual(['en', context.setLanguage]);
    expect(useAudioEnabled()).toEqual([false, context.setAudioEnabled]);
    expect(useAccent()).toEqual(['rose', context.setAccent]);
  });

  test('derives the themed colors from both dark mode and accent', () => {
    expect(useTheme()).toEqual({ colors: { isDark: true, accent: 'rose', primary: '#test' }, isDark: true });
    expect(getColors).toHaveBeenCalledWith(true, 'rose');
  });

  test('resolves translations from the active language', () => {
    expect(useTranslations()).toEqual({ language: 'en' });
    expect(getTranslations).toHaveBeenCalledWith('en');
  });
});
