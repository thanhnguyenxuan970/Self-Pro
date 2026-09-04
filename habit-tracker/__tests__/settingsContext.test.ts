const effectCallbacks: Array<() => void> = [];
const stateSetters: jest.Mock[] = [];
let currentContext: unknown;

jest.mock('react', () => {
  const createContext = (defaultValue: unknown) => {
    const context = {
      current: defaultValue,
      Provider: ({ value, children }: { value: unknown; children: unknown }) => {
        context.current = value;
        currentContext = value;
        return children;
      },
    };
    currentContext = defaultValue;
    return context;
  };
  const mockReact = {
    createContext,
    createElement: (type: (props: unknown) => unknown, props: unknown, ...children: unknown[]) =>
      type({ ...(props as object), children: children.length === 1 ? children[0] : children }),
    useContext: (context: { current: unknown }) => context.current,
    useState: (initialValue: unknown) => {
      const setter = jest.fn();
      stateSetters.push(setter);
      return [initialValue, setter];
    },
    useEffect: (callback: () => void) => { effectCallbacks.push(callback); },
    useCallback: (callback: unknown) => callback,
  };
  return { __esModule: true, ...mockReact, default: mockReact };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('react-native', () => ({
  NativeModules: { ExpoLocalization: {} },
}));
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));
jest.mock('../src/audio/audioEnabled', () => ({ setAudioEnabled: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioEnabled as syncAudioEnabled } from '../src/audio/audioEnabled';
import { SettingsProvider, useSettingsContext } from '../src/contexts/SettingsContext';

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  effectCallbacks.length = 0;
  stateSetters.length = 0;
});

async function flushSettingsEffect(): Promise<void> {
  expect(effectCallbacks).toHaveLength(1);
  effectCallbacks[0]();
  await Promise.resolve();
  await Promise.resolve();
}

describe('SettingsProvider persistence and defaults', () => {
  test('loads device language on first launch and uses the documented audio default', async () => {
    const child = 'home';
    expect(SettingsProvider({ children: child })).toBe(child);
    await flushSettingsEffect();

    expect(stateSetters[0]).toHaveBeenCalledWith(false);
    expect(stateSetters[1]).toHaveBeenCalledWith('en');
    expect(stateSetters[2]).toHaveBeenCalledWith(true);
    expect(stateSetters[3]).toHaveBeenCalledWith('green');
    expect(syncAudioEnabled).toHaveBeenCalledWith(true);
  });

  test('prefers explicit stored settings over device defaults', async () => {
    await AsyncStorage.multiSet([
      ['habit_dark_mode', 'true'],
      ['habit_language', 'vi'],
      ['habit_audio_enabled', 'false'],
      ['habit_accent', 'rose'],
    ]);
    SettingsProvider({ children: null });
    await flushSettingsEffect();

    expect(stateSetters[0]).toHaveBeenCalledWith(true);
    expect(stateSetters[1]).toHaveBeenCalledWith('vi');
    expect(stateSetters[2]).toHaveBeenCalledWith(false);
    expect(stateSetters[3]).toHaveBeenCalledWith('rose');
    expect(syncAudioEnabled).toHaveBeenCalledWith(false);
  });

  test('persists every setter with normalized storage values', async () => {
    SettingsProvider({ children: null });
    const settings = useSettingsContext() as {
      setDarkMode: (value: boolean) => void;
      setLanguage: (value: 'vi' | 'en') => void;
      setAudioEnabled: (value: boolean) => void;
      setAccent: (value: 'green' | 'honey') => void;
    };

    settings.setDarkMode(true);
    settings.setLanguage('en');
    settings.setAudioEnabled(false);
    settings.setAccent('honey');
    await Promise.resolve();

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('habit_dark_mode', 'true');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('habit_language', 'en');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('habit_audio_enabled', 'false');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('habit_accent', 'honey');
    expect(syncAudioEnabled).toHaveBeenCalledWith(false);
  });

  test('swallows settings-load failures without crashing the provider', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));
    expect(SettingsProvider({ children: null })).toBeNull();
    await flushSettingsEffect();
    warn.mockRestore();
  });
});
