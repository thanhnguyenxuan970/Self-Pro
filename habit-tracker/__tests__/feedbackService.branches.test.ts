const mockInvoke = jest.fn().mockResolvedValue({ data: { result: 'OK' }, error: null });
const mockGetItem = jest.fn().mockResolvedValue(null);
const mockSetItem = jest.fn().mockResolvedValue(undefined);

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: mockGetItem, setItem: mockSetItem },
}));

jest.mock('../src/api/supabase', () => ({ supabase: { functions: { invoke: mockInvoke } } }));
jest.mock('../src/qa/qaSandbox', () => ({ isQaSandboxActive: jest.fn(() => false) }));

test('handles missing app version, empty/native locale variants, and an empty timezone safely', async () => {
  const originalDateTimeFormat = Intl.DateTimeFormat;
  const getLocales = jest.fn((): Array<{ languageTag?: unknown }> => [{ languageTag: '' }]);
  jest.resetModules();
  jest.doMock('../app.json', () => ({ __esModule: true, default: { expo: { version: 42 } } }));
  jest.doMock('react-native', () => ({
    Platform: { OS: 'android', Version: 33, constants: null },
    NativeModules: { ExpoLocalization: {} },
  }));
  jest.doMock('expo-localization', () => ({ getLocales }));
  try {
    const service = await import('../src/api/feedbackService');
    (Intl as unknown as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = jest.fn(() => ({
      resolvedOptions: () => ({ timeZone: '' }),
    })) as unknown as typeof Intl.DateTimeFormat;

    await expect(service.submitFeedback({ type: 'BUG', message: 'locale empty branch', userEmail: null })).resolves.toBe('OK');
    getLocales.mockReturnValueOnce([{}]);
    await expect(service.submitFeedback({ type: 'BUG', message: 'locale missing branch', userEmail: null })).resolves.toBe('OK');
    getLocales.mockReturnValueOnce([{ languageTag: 'x'.repeat(80) }]);
    await expect(service.submitFeedback({ type: 'BUG', message: 'locale long branch', userEmail: null })).resolves.toBe('OK');
  } finally {
    (Intl as unknown as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = originalDateTimeFormat;
    jest.dontMock('../app.json');
    jest.dontMock('react-native');
    jest.dontMock('expo-localization');
    jest.resetModules();
  }
});
