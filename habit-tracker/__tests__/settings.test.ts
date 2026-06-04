import { parseSettingsBool, parseSettingsLang, validateNotificationTime } from '../src/utils/settingsLogic';

describe('parseSettingsBool', () => {
  test('null → false', () => expect(parseSettingsBool(null)).toBe(false));
  test('"true" → true', () => expect(parseSettingsBool('true')).toBe(true));
  test('"false" → false', () => expect(parseSettingsBool('false')).toBe(false));
  test('empty string → false', () => expect(parseSettingsBool('')).toBe(false));
  test('garbage → false', () => expect(parseSettingsBool('garbage')).toBe(false));
  test('"1" → false (only exact "true")', () => expect(parseSettingsBool('1')).toBe(false));
});

describe('parseSettingsLang', () => {
  test('null → vi', () => expect(parseSettingsLang(null)).toBe('vi'));
  test('"vi" → vi', () => expect(parseSettingsLang('vi')).toBe('vi'));
  test('"en" → en', () => expect(parseSettingsLang('en')).toBe('en'));
  test('unknown locale → vi fallback', () => expect(parseSettingsLang('fr')).toBe('vi'));
  test('garbage → vi fallback', () => expect(parseSettingsLang('garbage')).toBe('vi'));
  test('empty string → vi fallback', () => expect(parseSettingsLang('')).toBe('vi'));
});

describe('validateNotificationTime', () => {
  test('"07:30" valid', () => expect(validateNotificationTime('07:30')).toBe(true));
  test('"00:00" valid', () => expect(validateNotificationTime('00:00')).toBe(true));
  test('"23:59" valid', () => expect(validateNotificationTime('23:59')).toBe(true));
  test('"12:00" valid', () => expect(validateNotificationTime('12:00')).toBe(true));
  test('"20:15" valid', () => expect(validateNotificationTime('20:15')).toBe(true));

  test('"24:00" invalid hour', () => expect(validateNotificationTime('24:00')).toBe(false));
  test('"99:99" invalid', () => expect(validateNotificationTime('99:99')).toBe(false));
  test('"12:60" invalid minutes', () => expect(validateNotificationTime('12:60')).toBe(false));
  test('"7:30" not zero-padded → false', () => expect(validateNotificationTime('7:30')).toBe(false));
  test('empty string → false', () => expect(validateNotificationTime('')).toBe(false));
  test('"abc" garbage → false', () => expect(validateNotificationTime('abc')).toBe(false));
  test('"7:3" single digit both → false', () => expect(validateNotificationTime('7:3')).toBe(false));
  test('"23:60" boundary minutes → false', () => expect(validateNotificationTime('23:60')).toBe(false));
});
