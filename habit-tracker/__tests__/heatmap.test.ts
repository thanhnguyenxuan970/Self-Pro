import { buildHeatmapWeeks, heatmapLevel, heatmapShades } from '../src/utils/heatmap';
import { ACCENTS, AccentKey } from '../src/config/accents';
import { getColors } from '../src/config/theme';
import { getTranslations } from '../src/config/i18n';

test('maps points to the five heatmap levels and pads Monday-based weeks', () => {
  expect([0, 49, 50, 75, 100].map(points => heatmapLevel(points, 50))).toEqual([0, 1, 2, 3, 4]);
  const weeks = buildHeatmapWeeks([{ local_date: '2026-07-10', total_points: 100 }], 50, new Date(2026, 6, 10));
  expect(weeks.every(week => week.length === 7)).toBe(true);
  expect(weeks.flat().find(cell => cell.date === '2026-07-10')?.level).toBe(4);
  expect(weeks.flat().find(cell => cell.date === '2026-07-01')?.month).toBe('Jul');
});

test.each([false, true])('uses the selected accent for every heatmap level in %s mode', (isDark) => {
  for (const accent of Object.keys(ACCENTS) as AccentKey[]) {
    const colors = getColors(isDark, accent);
    expect(colors.primary).toBe(ACCENTS[accent][isDark ? 'dark' : 'light'].primary);
    expect(heatmapShades(colors)).toEqual([
      colors.surface3, colors.primarySoft, colors.primary, colors.primaryHover, colors.primaryPress,
    ]);
  }
});

test.each(['vi', 'en'] as const)('has every Settings label needed at %s layout', (language) => {
  const t = getTranslations(language);
  for (const label of [t.sectionAppearance, t.darkModeLabel, t.accentColorLabel, t.sectionSound, t.soundEnabledLabel, t.sectionLanguage]) {
    expect(label.trim()).not.toBe('');
  }
});
