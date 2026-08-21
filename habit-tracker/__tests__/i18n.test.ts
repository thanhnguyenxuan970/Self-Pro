import { getTranslations } from '../src/config/i18n';

test('rank total stars are displayed as whole stars in Vietnamese and English', () => {
  expect(getTranslations('vi').starsTotal(43.4)).toBe('★ 43');
  expect(getTranslations('en').starsTotal(43.4)).toBe('★ 43');
});
