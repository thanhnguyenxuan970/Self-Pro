/**
 * Tests for accent config + parseSettingsAccent() added in feature/paywall-screen:
 *   - ACCENTS palette structure integrity
 *   - DEFAULT_ACCENT value
 *   - parseSettingsAccent() parsing/fallback logic
 */
import { ACCENTS, DEFAULT_ACCENT, AccentKey } from '../src/config/accents';
import { parseSettingsAccent } from '../src/utils/settingsLogic';

// ── ACCENTS palette integrity ────────────────────────────────────────────────

describe('ACCENTS palette structure', () => {
  const expectedKeys: AccentKey[] = ['green', 'indigo', 'rose', 'sky', 'violet', 'honey'];

  test('contains all expected accent keys', () => {
    expect(Object.keys(ACCENTS).sort()).toEqual([...expectedKeys].sort());
  });

  test('each accent has swatch, onAccent, light, dark', () => {
    for (const key of expectedKeys) {
      const accent = ACCENTS[key];
      expect(accent).toHaveProperty('swatch');
      expect(accent).toHaveProperty('onAccent');
      expect(accent).toHaveProperty('light');
      expect(accent).toHaveProperty('dark');
    }
  });

  test('each accent light/dark has all required color tokens', () => {
    const tokens = ['primary', 'primaryHover', 'primaryPress', 'primarySoft'] as const;
    for (const key of expectedKeys) {
      const accent = ACCENTS[key];
      for (const token of tokens) {
        expect(accent.light).toHaveProperty(token);
        expect(accent.dark).toHaveProperty(token);
        // Must be a CSS hex string
        expect(accent.light[token]).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
        expect(accent.dark[token]).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
      }
    }
  });

  test('swatch values are valid hex colors', () => {
    for (const key of expectedKeys) {
      expect(ACCENTS[key].swatch).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  test('honey accent added with correct swatch #F59E0B', () => {
    expect(ACCENTS.honey.swatch).toBe('#F59E0B');
  });

  test('DEFAULT_ACCENT is green', () => {
    expect(DEFAULT_ACCENT).toBe('green');
  });

  test('DEFAULT_ACCENT exists in ACCENTS', () => {
    expect(ACCENTS).toHaveProperty(DEFAULT_ACCENT);
  });
});

// ── parseSettingsAccent ──────────────────────────────────────────────────────

describe('parseSettingsAccent', () => {
  test('null → DEFAULT_ACCENT (green)', () => {
    expect(parseSettingsAccent(null)).toBe('green');
  });

  test('"green" → green', () => {
    expect(parseSettingsAccent('green')).toBe('green');
  });

  test('"indigo" → indigo', () => {
    expect(parseSettingsAccent('indigo')).toBe('indigo');
  });

  test('"rose" → rose', () => {
    expect(parseSettingsAccent('rose')).toBe('rose');
  });

  test('"sky" → sky', () => {
    expect(parseSettingsAccent('sky')).toBe('sky');
  });

  test('"violet" → violet', () => {
    expect(parseSettingsAccent('violet')).toBe('violet');
  });

  test('"honey" → honey (new accent key)', () => {
    expect(parseSettingsAccent('honey')).toBe('honey');
  });

  test('unknown accent name → DEFAULT_ACCENT fallback', () => {
    expect(parseSettingsAccent('purple')).toBe('green');
  });

  test('empty string → DEFAULT_ACCENT fallback', () => {
    expect(parseSettingsAccent('')).toBe('green');
  });

  test('garbage → DEFAULT_ACCENT fallback', () => {
    expect(parseSettingsAccent('blue-200')).toBe('green');
  });

  test('all valid AccentKey values parse correctly', () => {
    const keys: AccentKey[] = ['green', 'indigo', 'rose', 'sky', 'violet', 'honey'];
    for (const key of keys) {
      expect(parseSettingsAccent(key)).toBe(key);
    }
  });
});
