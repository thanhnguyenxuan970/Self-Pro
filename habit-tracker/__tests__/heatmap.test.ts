import { buildHeatmapWeeks, heatmapLevel, heatmapShades } from '../src/utils/heatmap';
import { ACCENTS, AccentKey } from '../src/config/accents';
import { getColors } from '../src/config/theme';
import { getTranslations } from '../src/config/i18n';

const stepHeatmapAccessibilityDate = (
  require('../src/utils/heatmap') as {
    stepHeatmapAccessibilityDate?: (dates: string[], current: string, direction: 'next' | 'previous') => string;
  }
).stepHeatmapAccessibilityDate;

test('maps stars to the five heatmap levels and pads Monday-based weeks', () => {
  expect([0, 5, 10, 20, 21].map(heatmapLevel)).toEqual([0, 1, 2, 3, 4]);
  const weeks = buildHeatmapWeeks([{ local_date: '2026-07-10', total_points: 100, stars: 21 }], new Date(2026, 6, 10));
  expect(weeks.every(week => week.length === 7)).toBe(true);
  expect(weeks.flat().find(cell => cell.date === '2026-07-10')?.level).toBe(4);
  expect(weeks.flat().find(cell => cell.date === '2026-07-01')?.month).toBe('Jul');
});

test('steps the single accessible heatmap control without leaving the available date range', () => {
  const dates = ['2026-08-09', '2026-08-10', '2026-08-11'];
  expect(stepHeatmapAccessibilityDate?.(dates, '2026-08-10', 'next')).toBe('2026-08-11');
  expect(stepHeatmapAccessibilityDate?.(dates, '2026-08-10', 'previous')).toBe('2026-08-09');
  expect(stepHeatmapAccessibilityDate?.(dates, '2026-08-11', 'next')).toBe('2026-08-11');
});

test.each([false, true])('uses the selected accent for every heatmap level in %s mode', (isDark) => {
  for (const accent of Object.keys(ACCENTS) as AccentKey[]) {
    const colors = getColors(isDark, accent);
    expect(colors.primary).toBe(ACCENTS[accent][isDark ? 'dark' : 'light'].primary);
    expect(heatmapShades(colors)).toEqual([
      colors.surface2, `${colors.primary}40`, `${colors.primary}66`, `${colors.primary}99`, colors.primary,
    ]);
  }
});

test.each(['vi', 'en'] as const)('has every localized label needed at %s layout', (language) => {
  const t = getTranslations(language);
  for (const label of [t.sectionAppearance, t.darkModeLabel, t.accentColorLabel, t.sectionSound, t.soundEnabledLabel, t.sectionLanguage, t.heatmapLegendTitle, t.heatmapLegendSubtitle, t.heatmapLegendNoStars, t.heatmapLegendEmptyCell, t.heatmapLegendUnit, t.heatmapLegendOnGrid, t.heatmapAccessibilityLabel, t.heatmapPreviousDay, t.heatmapNextDay, t.heatmapOpenDayDetails, ...t.heatmapLegendRanges]) {
    expect(label.trim()).not.toBe('');
  }
});
