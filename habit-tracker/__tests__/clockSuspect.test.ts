import { selectClockSuspectLocalIds, CLOCK_SUSPECT_TOLERANCE_MS } from '../src/lib/clockSuspect';

describe('selectClockSuspectLocalIds', () => {
  const NOW = Date.parse('2026-07-09T12:00:00.000Z');

  it('clean ascending logs synced promptly: nothing flagged', () => {
    const rows = [
      { local_id: 1, logged_at: NOW - 1000, created_at: new Date(NOW).toISOString() },
      { local_id: 2, logged_at: NOW - 500, created_at: new Date(NOW + 200).toISOString() },
    ];
    expect(selectClockSuspectLocalIds(rows)).toEqual([]);
  });

  it('a rolled-back row: logged_at far earlier than the server insert time is flagged', () => {
    const rolledBackLoggedAt = NOW - 30 * 24 * 60 * 60 * 1000; // "30 days ago" per the rolled-back clock
    const rows = [
      { local_id: 1, logged_at: rolledBackLoggedAt, created_at: new Date(NOW).toISOString() },
    ];
    expect(selectClockSuspectLocalIds(rows)).toEqual([1]);
  });

  it('a legitimate offline-queued log within tolerance is not flagged', () => {
    const withinTolerance = NOW - (CLOCK_SUSPECT_TOLERANCE_MS - 1000);
    const rows = [
      { local_id: 1, logged_at: withinTolerance, created_at: new Date(NOW).toISOString() },
    ];
    expect(selectClockSuspectLocalIds(rows)).toEqual([]);
  });

  it('a gap exactly at the tolerance boundary is not flagged (strictly greater-than triggers)', () => {
    const atBoundary = NOW - CLOCK_SUSPECT_TOLERANCE_MS;
    const rows = [
      { local_id: 1, logged_at: atBoundary, created_at: new Date(NOW).toISOString() },
    ];
    expect(selectClockSuspectLocalIds(rows)).toEqual([]);
  });

  it('a gap one millisecond past the tolerance boundary is flagged', () => {
    const pastBoundary = NOW - CLOCK_SUSPECT_TOLERANCE_MS - 1;
    const rows = [
      { local_id: 1, logged_at: pastBoundary, created_at: new Date(NOW).toISOString() },
    ];
    expect(selectClockSuspectLocalIds(rows)).toEqual([1]);
  });

  it('rows missing created_at (upsert response lacked the column) are skipped, not flagged', () => {
    const rows = [{ local_id: 1, logged_at: NOW - 999999999 }];
    expect(selectClockSuspectLocalIds(rows)).toEqual([]);
  });

  it('rows with a malformed created_at are skipped, not flagged', () => {
    const rows = [{ local_id: 1, logged_at: NOW - 999999999, created_at: 'not-a-date' }];
    expect(selectClockSuspectLocalIds(rows)).toEqual([]);
  });

  it('mixed batch: only the suspect rows are returned', () => {
    const rows = [
      { local_id: 1, logged_at: NOW - 100, created_at: new Date(NOW).toISOString() },
      { local_id: 2, logged_at: NOW - 30 * 24 * 60 * 60 * 1000, created_at: new Date(NOW).toISOString() },
      { local_id: 3, logged_at: NOW - 200, created_at: new Date(NOW).toISOString() },
    ];
    expect(selectClockSuspectLocalIds(rows)).toEqual([2]);
  });

  it('empty input yields no flags', () => {
    expect(selectClockSuspectLocalIds([])).toEqual([]);
  });
});
