import { getTranslations, Strings } from '../src/config/i18n';

test('rank total stars are displayed as whole stars in Vietnamese and English', () => {
  expect(getTranslations('vi').starsTotal(43.4)).toBe('★ 43');
  expect(getTranslations('en').starsTotal(43.4)).toBe('★ 43');
});

type TranslationFunction = (...args: unknown[]) => unknown;

function callableEntries(strings: Strings): Array<[string, TranslationFunction]> {
  return Object.entries(strings).filter(([, value]) => typeof value === 'function') as Array<[
    string,
    TranslationFunction,
  ]>;
}

test.each(['vi', 'en'] as const)('every %s formatter is callable with its public arity', (language) => {
  const strings = getTranslations(language);
  const entries = callableEntries(strings);
  expect(entries.length).toBeGreaterThan(100);
  for (const [, formatter] of entries) {
    expect(() => formatter(...Array.from({ length: formatter.length }, () => 1))).not.toThrow();
  }
});

test.each(['vi', 'en'] as const)('every %s conditional formatter covers its edge branches', (language) => {
  const t = getTranslations(language);
  expect(t.dailyGoalProgress(100, 100)).toBeTruthy();
  expect(t.dailyGoalProgress(99, 100)).toContain('1');
  expect(t.challengeHistoryReset(0)).toBeTruthy();
  expect(t.challengeHistoryReset(3)).toContain('3');
  expect(t.challengeHistoryResetWeek(0)).toBeTruthy();
  expect(t.challengeHistoryResetWeek(2)).toContain('2');
  expect(t.challengeLinkedHintThreshold(null, null)).toBe('');
  expect(t.challengeLinkedHintThreshold(30, null)).toContain('30');
  expect(t.challengeLinkedHintThreshold(null, 2)).toContain('2');
  expect(t.challengeLinkedHintThreshold(30, 2)).toContain('30');
  expect(t.challengeOutcomeNotifBody('Read', 'streak', 'Monday')).toContain('Read');
  expect(t.challengeOutcomeNotifBody('Read', 'weekly', 'Monday')).toContain('Read');
  expect(t.newsUnreadCount(0)).toBeTruthy();
  expect(t.newsUnreadCount(2)).toContain('2');
  expect(t.friendsCodeFiltered(1)).toBeTruthy();
  expect(t.friendsCodeFiltered(2)).toContain('2');
  expect(t.friendsRotateBody(0)).toBeTruthy();
  expect(t.friendsRotateBody(2)).toContain('2');
  expect(t.leaderboardMoveA11y(null)).toBeTruthy();
  expect(t.leaderboardMoveA11y(0)).toBeTruthy();
  expect(t.leaderboardMoveA11y(-1)).toBeTruthy();
  expect(t.homeBackfillBody(2, true)).toContain('2');
  expect(t.homeBackfillBody(2, false)).toContain('2');
  expect(t.homeBackfillTitle(1)).toBeTruthy();
  expect(t.homeBackfillTitle(2)).toBeTruthy();
  expect(t.homeBackfillCta(1)).toBeTruthy();
  expect(t.homeBackfillCta(2)).toBeTruthy();
});
