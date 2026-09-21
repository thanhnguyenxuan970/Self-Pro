import { shouldShowBackfillQuotaExhausted } from '../src/game/backfill';

describe('backfill quota UI state', () => {
  // Regression: ISSUE-001 — saving the last quota hid the locked backfill entries.
  // Found by /qa on 2026-09-21
  // Report: .gstack/qa-reports/qa-report-backfill-2026-09-21.md
  test('keeps the locked result visible after the last quota is consumed', () => {
    expect(shouldShowBackfillQuotaExhausted(0, true)).toBe(false);
    expect(shouldShowBackfillQuotaExhausted(0, false)).toBe(true);
    expect(shouldShowBackfillQuotaExhausted(1, false)).toBe(false);
  });
});
