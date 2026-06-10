import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseSettingsBool, parseSettingsLang } from '../utils/settingsLogic';
import { setAudioEnabled as syncAudioEnabled } from '../audio/audioEnabled';

export type AppLanguage = 'vi' | 'en';

const DARK_MODE_KEY = 'habit_dark_mode';
const LANGUAGE_KEY = 'habit_language';
const AUDIO_KEY = 'habit_audio_enabled';

type SettingsContextType = {
  isDark: boolean;
  lang: AppLanguage;
  audioEnabled: boolean;
  setDarkMode: (v: boolean) => void;
  setLanguage: (v: AppLanguage) => void;
  setAudioEnabled: (v: boolean) => void;
};

const SettingsContext = createContext<SettingsContextType>({
  isDark: false,
  lang: 'vi',
  audioEnabled: true,
  setDarkMode: () => {},
  setLanguage: () => {},
  setAudioEnabled: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [lang, setLang] = useState<AppLanguage>('vi');
  const [audioEnabled, setAudioState] = useState(true);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(DARK_MODE_KEY),
      AsyncStorage.getItem(LANGUAGE_KEY),
      AsyncStorage.getItem(AUDIO_KEY),
    ])
      .then(([darkVal, langVal, audioVal]) => {
        setIsDark(parseSettingsBool(darkVal));
        setLang(parseSettingsLang(langVal));
        // Default true when key absent (null → true)
        const audio = audioVal === null ? true : parseSettingsBool(audioVal);
        setAudioState(audio);
        syncAudioEnabled(audio);
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

  return (
    <SettingsContext.Provider value={{ isDark, lang, audioEnabled, setDarkMode, setLanguage, setAudioEnabled }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext() {
  return useContext(SettingsContext);
}
