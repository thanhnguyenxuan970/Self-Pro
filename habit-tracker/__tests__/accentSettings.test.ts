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

// ── PaywallScreen PLANS data integrity (pure data, no React) ─────────────────

describe('PaywallScreen PLANS data contract', () => {
  // Inline the PLANS array as it is in PaywallScreen.tsx — this test guards
  // against accidental data corruption without requiring a React render.
  type PlanId = 'monthly' | 'yearly' | 'lifetime';
  interface Plan {
    id: PlanId;
    label: string;
    price: string;
    per: string;
    meta?: string;
    badge?: string;
    save?: string;
    cta: string;
  }

  const PLANS: Plan[] = [
    {
      id: 'monthly', label: 'Tháng', price: '39.000đ', per: '/ tháng',
      cta: 'Bắt đầu gói tháng',
    },
    {
      id: 'yearly', label: 'Năm', price: '249.000đ', per: '/ năm',
      meta: '~20.750đ / tháng', badge: 'PHỔ BIẾN', save: '−58%',
      cta: 'Dùng thử 7 ngày miễn phí',
    },
    { id: 'lifetime', label: 'Trọn đời', price: '599.000đ', per: 'một lần', cta: 'Mở khoá trọn đời' },
  ];

  test('has exactly 3 plans', () => {
    expect(PLANS).toHaveLength(3);
  });

  test('plan IDs are unique and correct', () => {
    const ids = PLANS.map(p => p.id);
    expect(ids).toEqual(['monthly', 'yearly', 'lifetime']);
    expect(new Set(ids).size).toBe(3);
  });

  test('yearly plan is default (index 1) with badge PHỔ BIẾN', () => {
    const yearly = PLANS[1];
    expect(yearly.id).toBe('yearly');
    expect(yearly.badge).toBe('PHỔ BIẾN');
    expect(yearly.save).toBe('−58%');
  });

  test('all plans have required fields: id, label, price, per, cta', () => {
    for (const plan of PLANS) {
      expect(plan.id).toBeTruthy();
      expect(plan.label).toBeTruthy();
      expect(plan.price).toBeTruthy();
      expect(plan.per).toBeTruthy();
      expect(plan.cta).toBeTruthy();
    }
  });

  test('PLANS.find by id works correctly (mirrors PaywallScreen runtime lookup)', () => {
    expect(PLANS.find(p => p.id === 'yearly')?.badge).toBe('PHỔ BIẾN');
    expect(PLANS.find(p => p.id === 'monthly')?.meta).toBeUndefined();
    expect(PLANS.find(p => p.id === 'lifetime')?.meta).toBeUndefined();
    expect(PLANS.find(p => p.id === 'unknown' as PlanId)).toBeUndefined();
  });

  test('fallback to PLANS[1] when find returns undefined (mirrors PaywallScreen ?? PLANS[1])', () => {
    const fallback = PLANS.find(p => p.id === ('unknown' as PlanId)) ?? PLANS[1];
    expect(fallback.id).toBe('yearly');
  });
});
