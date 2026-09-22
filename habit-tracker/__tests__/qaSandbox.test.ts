jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  buildQaSandboxLeaderboard,
  buildQaSandboxFixture,
  createQaSandboxUser,
  isQaSandboxActive,
  isQaSandboxIdentity,
  purgeQaSandbox,
  resetQaSandbox,
  seedQaSandbox,
  setQaSandboxNetworkBlocked,
} from '../src/qa/qaSandbox';
import { createQaGuardedFetch } from '../src/api/supabase';
import { restoreStoredGoogleSession } from '../src/hooks/useAuth';

jest.mock('@react-native-async-storage/async-storage', () => ({
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/utils/notifications', () => ({
  cancelChallengeReminders: jest.fn().mockResolvedValue(undefined),
}));

describe('QA sandbox identity and fixture contract', () => {
  afterEach(() => setQaSandboxNetworkBlocked(false));

  it('uses a reserved local identity that is clearly not a real account', () => {
    const user = createQaSandboxUser();

    expect(user).toMatchObject({
      sub: 'qa-sandbox-local-v1',
      email: 'qa-sandbox@local.habi',
      name: 'QA Sandbox',
    });
    expect(isQaSandboxIdentity(user)).toBe(true);
    expect(isQaSandboxIdentity({ sub: 'real-google-sub' })).toBe(false);
  });

  it('creates deterministic history with current, gap, penalty, and bonus states', () => {
    const now = new Date('2026-08-22T10:00:00+07:00');
    const first = buildQaSandboxFixture(now);
    const second = buildQaSandboxFixture(now);

    expect(second).toEqual(first);
    expect(first.tasks).toHaveLength(8);
    expect(first.activities.length).toBeGreaterThan(300);
    expect(first.dailySummaries.length).toBeGreaterThan(150);
    expect(first.activities.some(row => row.kind === 'BAD' && row.starsDelta < 0)).toBe(true);
    expect(first.activities.some(row => row.source === 'DAILY_BONUS' && row.starsDelta > 0)).toBe(true);
    expect(first.dailySummaries.some(row => row.localDate === '2026-08-22' && row.totalPoints > 0)).toBe(true);
    expect(first.dailySummaries.length).toBe(new Set(first.dailySummaries.map(row => row.localDate)).size);
  });

  it('builds an in-memory leaderboard without adding rows to the local fixture', () => {
    const first = buildQaSandboxLeaderboard(419);
    const second = buildQaSandboxLeaderboard(419);
    const current = first.find(row => row.is_current_user);

    expect(second).toEqual(first);
    expect(first).toHaveLength(21);
    expect(first.slice(0, 15)).toHaveLength(15);
    expect(first.map(row => row.rank)).toEqual(first.map((_, index) => index + 1));
    expect(current).toMatchObject({
      player_id: 'qa-sandbox-local-v1',
      year_stars: 419,
      rank: 15,
      is_current_user: true,
    });
    expect(first.some(row => row.rank_delta_7d === null)).toBe(true);
    expect(first.some(row => row.rank_delta_7d! > 0)).toBe(true);
    expect(first.some(row => row.rank_delta_7d! < 0)).toBe(true);
    expect(buildQaSandboxLeaderboard(Number.NaN).find(row => row.is_current_user)?.year_stars).toBe(0);
    expect(buildQaSandboxLeaderboard(-12).find(row => row.is_current_user)?.year_stars).toBe(0);
    expect(buildQaSandboxLeaderboard(980).filter(row => row.year_stars === 980)).toHaveLength(2);
  });

  it('blocks Supabase transport before the underlying fetch is called', async () => {
    const baseFetch = jest.fn().mockResolvedValue({} as Response);
    const guardedFetch = createQaGuardedFetch(baseFetch);

    setQaSandboxNetworkBlocked(true);
    await expect(guardedFetch('https://example.test')).rejects.toThrow('disabled in the QA sandbox');
    expect(baseFetch).not.toHaveBeenCalled();

    setQaSandboxNetworkBlocked(false);
    await guardedFetch('https://example.test');
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(isQaSandboxActive()).toBe(false);
  });

  it('restores the QA identity without attempting a Supabase session', async () => {
    const user = createQaSandboxUser();
    const ensureSession = jest.fn().mockRejectedValue(new Error('network must not be used'));

    await expect(restoreStoredGoogleSession('true', JSON.stringify(user), ensureSession)).resolves.toEqual({
      isOnboarded: true,
      googleUser: user,
    });
    expect(ensureSession).not.toHaveBeenCalled();
    expect(isQaSandboxActive()).toBe(true);
  });

  it('purges only the reserved user and its challenge reminders', async () => {
    const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue({ id: 7 }),
      getAllAsync: jest.fn().mockResolvedValue([{ id: 11, notification_id: 'old' }, { id: 12, notification_id: null }]),
      runAsync,
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    };
    await purgeQaSandbox(db as never, false);
    expect(runAsync).toHaveBeenCalledWith(
      'DELETE FROM pending_activity_deletes WHERE account_key = ?',
      ['qa-sandbox@local.habi'],
    );
    expect(runAsync).not.toHaveBeenCalledWith('DELETE FROM users WHERE id = ?', [7]);
    await purgeQaSandbox(db as never, true);
    expect(runAsync).toHaveBeenCalledWith('DELETE FROM users WHERE id = ?', [7]);

    const emptyDb = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    };
    await expect(purgeQaSandbox(emptyDb as never)).resolves.toBeUndefined();
    expect(emptyDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM pending_activity_deletes WHERE account_key = ?',
      ['qa-sandbox@local.habi'],
    );

    const userWithoutChallenges = {
      getFirstAsync: jest.fn().mockResolvedValue({ id: 8 }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    };
    await purgeQaSandbox(userWithoutChallenges as never);
    expect(userWithoutChallenges.runAsync).toHaveBeenCalledWith('DELETE FROM users WHERE id = ?', [8]);
  });

  it('seeds the fixture transaction once when concurrent callers race', async () => {
    let nextId = 0;
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      getAllAsync: jest.fn().mockResolvedValue([
        { id: 1, tier_order: 1, stars_required: 1 },
        { id: 2, tier_order: 2, stars_required: 10 },
        { id: 3, tier_order: 3, stars_required: 100 },
      ]),
      runAsync: jest.fn().mockImplementation(async () => ({ changes: 1, lastInsertRowId: ++nextId })),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    };
    const now = new Date('2026-08-22T10:00:00+07:00');
    const [first, second] = await Promise.all([seedQaSandbox(db as never, now), seedQaSandbox(db as never, now)]);
    expect(first).toBe(second);
    expect(first).toBeGreaterThan(0);
    expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('google_sub, account_key, treat_stars'),
      expect.arrayContaining(['qa-sandbox-local-v1', 'qa-sandbox@local.habi']),
    );
    expect(isQaSandboxActive()).toBe(true);
  });

  it('keeps an existing fixture through a cold restart instead of reseeding it', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue({ id: 77 }),
      getAllAsync: jest.fn(),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(),
    };

    await expect(seedQaSandbox(db as never)).resolves.toBe(77);
    expect(db.withTransactionAsync).not.toHaveBeenCalled();
    expect(db.runAsync).not.toHaveBeenCalled();
    expect(isQaSandboxActive()).toBe(true);
  });

  it('resets only after an explicit reset request', async () => {
    let nextId = 100;
    const db = {
      getFirstAsync: jest.fn()
        .mockResolvedValueOnce({ id: 77 })
        .mockResolvedValueOnce(null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn().mockImplementation(async () => ({ changes: 1, lastInsertRowId: ++nextId })),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    };

    await expect(resetQaSandbox(db as never, new Date('2026-08-22T10:00:00+07:00'))).resolves.toBeGreaterThan(0);
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM users WHERE id = ?', [77]);
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('google_sub, account_key, treat_stars'),
      expect.arrayContaining(['qa-sandbox-local-v1', 'qa-sandbox@local.habi']),
    );
  });

  it('seeds safely when no rank tiers exist yet', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn().mockImplementation(async () => ({ changes: 1, lastInsertRowId: 1 })),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    };
    await expect(seedQaSandbox(db as never, new Date('2026-08-22T10:00:00+07:00'))).resolves.toBe(1);
    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE users SET current_tier_id = ?, lifetime_stars = ?, treat_stars = ?, treat_stars_lifetime = ? WHERE id = ?',
      [null, expect.any(Number), 42, expect.any(Number), 1],
    );
  });
});
