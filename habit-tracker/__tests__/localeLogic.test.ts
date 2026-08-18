import {
  resolveDeviceLocaleTag,
  resolveDeviceLanguageCode,
  resolveDefaultAppLanguage,
} from '../src/utils/localeLogic';

describe('resolveDeviceLocaleTag', () => {
  test('returns the first locale\'s languageTag', () => {
    expect(resolveDeviceLocaleTag([{ languageTag: 'en-PK', languageCode: 'en' }])).toBe('en-PK');
  });

  test('null/undefined/empty list falls back to unknown', () => {
    expect(resolveDeviceLocaleTag(null)).toBe('unknown');
    expect(resolveDeviceLocaleTag(undefined)).toBe('unknown');
    expect(resolveDeviceLocaleTag([])).toBe('unknown');
  });

  test('empty-string languageTag falls back to unknown', () => {
    expect(resolveDeviceLocaleTag([{ languageTag: '' }])).toBe('unknown');
  });
});

describe('resolveDeviceLanguageCode', () => {
  test('returns the first locale\'s lowercased languageCode', () => {
    expect(resolveDeviceLanguageCode([{ languageCode: 'EN', languageTag: 'en-PK' }])).toBe('en');
  });

  test('falls back to deriving the code from languageTag when languageCode is missing', () => {
    expect(resolveDeviceLanguageCode([{ languageTag: 'en-PK' }])).toBe('en');
    expect(resolveDeviceLanguageCode([{ languageTag: 'zh_CN' }])).toBe('zh');
  });

  test('null/undefined/empty list falls back to unknown', () => {
    expect(resolveDeviceLanguageCode(null)).toBe('unknown');
    expect(resolveDeviceLanguageCode(undefined)).toBe('unknown');
    expect(resolveDeviceLanguageCode([])).toBe('unknown');
  });

  test('entry with neither languageCode nor languageTag falls back to unknown', () => {
    expect(resolveDeviceLanguageCode([{}])).toBe('unknown');
  });
});

describe('resolveDefaultAppLanguage', () => {
  test('Vietnamese device locale defaults the app to vi', () => {
    expect(resolveDefaultAppLanguage('vi')).toBe('vi');
  });

  test('any non-Vietnamese device locale defaults the app to en', () => {
    expect(resolveDefaultAppLanguage('en')).toBe('en');
    expect(resolveDefaultAppLanguage('fr')).toBe('en');
    expect(resolveDefaultAppLanguage('zh')).toBe('en');
    expect(resolveDefaultAppLanguage('unknown')).toBe('en');
  });
});
