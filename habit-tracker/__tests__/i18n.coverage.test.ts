import { getTranslations, Strings } from '../src/config/i18n';

type TranslationFunction = (...args: unknown[]) => unknown;

function callableEntries(strings: Strings): Array<[string, TranslationFunction]> {
  return Object.entries(strings).filter(([, value]) => typeof value === 'function') as Array<[
    string,
    TranslationFunction,
  ]>;
}

function defaultArgs(fn: TranslationFunction): unknown[] {
  // Locale functions are pure formatters. Numeric values are safe for string
  // interpolation, comparisons, and the one toFixed call; this also ensures
  // every formatter remains callable as the locale grows.
  return Array.from({ length: fn.length }, () => 1);
}

describe('translation formatter contract', () => {
  test.each(['vi', 'en'] as const)('%s exposes callable formatters for every function-valued key', (language) => {
    const strings = getTranslations(language);
    const entries = callableEntries(strings);
    expect(entries.length).toBeGreaterThan(100);
    for (const [key, formatter] of entries) {
      expect(() => formatter(...defaultArgs(formatter))).not.toThrow();
      expect(String(formatter(...defaultArgs(formatter)))).not.toBe('undefined');
      expect(key).toBeTruthy();
    }
  });

  test.each(['vi', 'en'] as const)('%s covers formatter branch variants', (language) => {
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
});
