import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseSettingsBool, parseSettingsLang, parseSettingsAccent } from '../utils/settingsLogic';
import { resolveDefaultAppLanguage, resolveDeviceLanguageCode } from '../utils/localeLogic';
import { setAudioEnabled as syncAudioEnabled } from '../audio/audioEnabled';
import type { AppLanguage } from '../config/i18n';
import { AccentKey, DEFAULT_ACCENT } from '../config/accents';
export type { AppLanguage } from '../config/i18n';

const DARK_MODE_KEY = 'habit_dark_mode';
const LANGUAGE_KEY = 'habit_language';
const AUDIO_KEY = 'habit_audio_enabled';
const ACCENT_KEY = 'habit_accent';

type SettingsContextType = {
  isDark: boolean;
  lang: AppLanguage;
  audioEnabled: boolean;
  accent: AccentKey;
  setDarkMode: (v: boolean) => void;
  setLanguage: (v: AppLanguage) => void;
  setAudioEnabled: (v: boolean) => void;
  setAccent: (v: AccentKey) => void;
};

const SettingsContext = createContext<SettingsContextType>({
  isDark: false,
  lang: 'vi',
  audioEnabled: true,
  accent: DEFAULT_ACCENT,
  setDarkMode: () => {},
  setLanguage: () => {},
  setAudioEnabled: () => {},
  setAccent: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [lang, setLang] = useState<AppLanguage>('vi');
  const [audioEnabled, setAudioState] = useState(true);
  const [accent, setAccentState] = useState<AccentKey>(DEFAULT_ACCENT);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(DARK_MODE_KEY),
      AsyncStorage.getItem(LANGUAGE_KEY),
      AsyncStorage.getItem(AUDIO_KEY),
      AsyncStorage.getItem(ACCENT_KEY),
    ])
      .then(([darkVal, langVal, audioVal, accentVal]) => {
        setIsDark(parseSettingsBool(darkVal));
        // No stored preference yet (first launch, or a fresh install) —
        // default from the device's own locale instead of hardcoding 'vi'.
        // Once the user has an explicit stored value, it always wins below.
        if (langVal === null) {
          let deviceLang = 'unknown';
          try {
            // expo-localization ships a native module (autolinked from
            // app.json's plugin list). A JS-only update (Metro fast-refresh,
            // or a real EAS Update OTA push) can reach a device whose
            // installed native binary predates this dependency — Expo's
            // requireNativeModule() treats that as fatal and crashes the
            // whole app rather than throwing a catchable error, so this
            // checks the plain NativeModules registry (a safe property
            // lookup) *before* requiring the wrapper, instead of relying on
            // try/catch around the require() call. Runtime require (not a
            // static import) still matters too — same reasoning as the
            // Google Sign-In modules elsewhere in this codebase.
            const { NativeModules } = require('react-native');
            if (NativeModules.ExpoLocalization) {
              const Localization = require('expo-localization');
              deviceLang = resolveDeviceLanguageCode(Localization.getLocales());
            }
          } catch (e) { if (__DEV__) console.warn('[SettingsContext] failed to read device locale', e); }
          setLang(resolveDefaultAppLanguage(deviceLang));
        } else {
          setLang(parseSettingsLang(langVal));
        }
        // Default true when key absent (null → true)
        const audio = audioVal === null ? true : parseSettingsBool(audioVal);
        setAudioState(audio);
        syncAudioEnabled(audio);
        setAccentState(parseSettingsAccent(accentVal));
      })
      .catch((e) => { if (__DEV__) console.warn('[SettingsContext] failed to load settings', e); });
  }, []);

  const setDarkMode = useCallback((v: boolean) => {
    setIsDark(v);
    AsyncStorage.setItem(DARK_MODE_KEY, v ? 'true' : 'false').catch(() => {});
  }, []);

  const setLanguage = useCallback((v: AppLanguage) => {
    setLang(v);
    AsyncStorage.setItem(LANGUAGE_KEY, v).catch(() => {});
  }, []);

  const setAudioEnabled = useCallback((v: boolean) => {
    setAudioState(v);
    syncAudioEnabled(v);
    AsyncStorage.setItem(AUDIO_KEY, v ? 'true' : 'false').catch(() => {});
  }, []);

  const setAccent = useCallback((v: AccentKey) => {
    setAccentState(v);
    AsyncStorage.setItem(ACCENT_KEY, v).catch(() => {});
  }, []);

  return (
    <SettingsContext.Provider value={{ isDark, lang, audioEnabled, accent, setDarkMode, setLanguage, setAudioEnabled, setAccent }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext() {
  return useContext(SettingsContext);
}
