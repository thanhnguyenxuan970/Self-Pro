jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => options,
}));

jest.mock('../src/api/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

jest.mock('../src/api/syncService', () => ({
  ensureSupabaseSession: jest.fn(),
}));

import { aggregateLifetimeStarsByPlayerId, buildRankedLeaderboard, capLeaderboardRows, hasRankGapBefore, mapRemoteLeaderboardRows, useLeaderboard } from '../src/queries/useLeaderboard';

const mockSupabase = jest.requireMock('../src/api/supabase') as { supabase: { rpc: jest.Mock } };
const mockSyncService = jest.requireMock('../src/api/syncService') as { ensureSupabaseSession: jest.Mock };

beforeEach(() => {
  mockSupabase.supabase.rpc.mockReset();
  mockSyncService.ensureSupabaseSession.mockReset();
});

test('leaderboard reads each user lifetime_stars value without summing activity rows', () => {
  const map = aggregateLifetimeStarsByPlayerId([
    { player_id: 'player-a', lifetime_stars: 15 },
    { player_id: 'player-b', lifetime_stars: 3 },
    { player_id: 'player-zero', lifetime_stars: null },
  ]);
  expect(map.get('player-a')).toBe(15);
  expect(map.get('player-b')).toBe(3);
  expect(map.get('player-zero')).toBe(0);
});

test('global sort is strictly by lifetime score descending — rank 1 is the highest score', () => {
  const map = new Map([
    ['player-low', 5],
    ['player-high', 100],
    ['player-mid', 40],
  ]);
  const result = buildRankedLeaderboard(map, null);
  expect(result.map(e => e.playerId)).toEqual(['player-high', 'player-mid', 'player-low']);
  expect(result.map(e => e.rank)).toEqual([1, 2, 3]);
});

test('every player appears — no tier-band filtering, unlike the old per-tier leaderboard', () => {
  const map = new Map([
    ['player-zero', 0],
    ['player-whale', 5000],
  ]);
  const result = buildRankedLeaderboard(map, null);
  expect(result).toHaveLength(2);
});

test('ties break on player id ascending for a stable, deterministic order', () => {
  const map = new Map([
    ['player-zoe', 20],
    ['player-amy', 20],
    ['player-mike', 20],
  ]);
  const result = buildRankedLeaderboard(map, null);
  expect(result.map(e => e.playerId)).toEqual(['player-amy', 'player-mike', 'player-zoe']);
});

test('marks the current user and never fabricates a negative star count', () => {
  const map = new Map([['player-me', -3], ['player-other', 10]]);
  const result = buildRankedLeaderboard(map, 'player-me');
  const me = result.find(e => e.playerId === 'player-me')!;
  expect(me.isCurrentUser).toBe(true);
  expect(me.lifetimeStars).toBe(0);
});

test('maps server-ranked anonymous rows without recomputing global rank in the client', () => {
  const result = mapRemoteLeaderboardRows([
    { player_id: 'public-top', lifetime_stars: 100, rank: 1, is_current_user: false },
    { player_id: 'public-me', lifetime_stars: 4, rank: '87', is_current_user: true },
  ], 'Thanh', 'Player');

  expect(result.map(entry => entry.rank)).toEqual([1, 87]);
  expect(result[0].playerId).toBe('public-top');
  // The pseudonym is a curated word pair, not a slice of the UUID -- a hex
  // slug reads as seeded/bot data, which defeats the point of a ladder.
  expect(result[0].displayName).not.toContain('public');
  expect(result[0].displayName).toMatch(/^\D+ #\d{2}$/);
  expect(result[1].displayName).toBe('Thanh');
  expect(result[1].isCurrentUser).toBe(true);
  expect(JSON.stringify(result)).not.toContain('@');
});

test('normalizes malformed remote rows without leaking identity or negative values', () => {
  const [entry] = mapRemoteLeaderboardRows([
    { player_id: '', lifetime_stars: -8, rank: 0, is_current_user: false },
  ], '', 'Player');

  expect(entry.playerId).toBe('unknown');
  expect(entry.displayName).toBe('Player #unknown');
  expect(entry.lifetimeStars).toBe(0);
  expect(entry.rank).toBe(1);
  expect(JSON.stringify(entry)).not.toContain('@');
});

test('establishes the authenticated Supabase session before loading global rows', async () => {
  mockSyncService.ensureSupabaseSession.mockResolvedValue(undefined);
  mockSupabase.supabase.rpc.mockResolvedValue({ data: [], error: null });

  const query = useLeaderboard('me@example.com', 'Thanh', 'Player') as unknown as {
    queryFn: () => Promise<unknown>;
  };
  await query.queryFn();

  expect(mockSyncService.ensureSupabaseSession).toHaveBeenCalledWith('me@example.com');
  expect(mockSupabase.supabase.rpc).toHaveBeenCalledWith('get_global_leaderboard_v2', { p_limit: 50 });
});

test('does not call the RPC when session restoration fails', async () => {
  const failure = new Error('session expired');
  mockSyncService.ensureSupabaseSession.mockRejectedValue(failure);

  const query = useLeaderboard('me@example.com', 'Thanh', 'Player') as unknown as {
    queryFn: () => Promise<unknown>;
  };
  await expect(query.queryFn()).rejects.toBe(failure);
  expect(mockSupabase.supabase.rpc).not.toHaveBeenCalled();
});

test('disables the query when there is no signed-in email', () => {
  const query = useLeaderboard(null, null, 'Player') as unknown as { enabled: boolean };
  expect(query.enabled).toBe(false);
});

test('query function returns no rows when no signed-in email is available', async () => {
  const query = useLeaderboard(null, null, 'Player') as unknown as {
    queryFn: () => Promise<unknown>;
  };
  await expect(query.queryFn()).resolves.toEqual([]);
});

test('exposes missing Supabase configuration separately from an empty remote response', () => {
  const configuredClient = mockSupabase.supabase;
  mockSupabase.supabase = null as never;
  try {
    const query = useLeaderboard('me@example.com', 'Thanh', 'Player') as unknown as {
      enabled: boolean;
      isUnavailable: boolean;
    };
    expect(query.enabled).toBe(false);
    expect(query.isUnavailable).toBe(true);
  } finally {
    mockSupabase.supabase = configuredClient;
  }
});

test('returns the caller rank neighbourhood alongside the top block, in rank order', () => {
  const result = mapRemoteLeaderboardRows([
    { player_id: 'top-1', lifetime_stars: 900, rank: 1, is_current_user: false },
    { player_id: 'top-2', lifetime_stars: 800, rank: 2, is_current_user: false },
    { player_id: 'above', lifetime_stars: 62, rank: 119, is_current_user: false },
    { player_id: 'me', lifetime_stars: 50, rank: 120, is_current_user: true },
    { player_id: 'below', lifetime_stars: 44, rank: 121, is_current_user: false },
  ], 'Thanh', 'Player');

  expect(result.map(entry => entry.rank)).toEqual([1, 2, 119, 120, 121]);
  expect(JSON.stringify(result)).not.toContain('@');
});

test('gap to next is measured only against the row exactly one rank above', () => {
  const result = mapRemoteLeaderboardRows([
    { player_id: 'top-1', lifetime_stars: 900, rank: 1, is_current_user: false },
    { player_id: 'above', lifetime_stars: 62, rank: 119, is_current_user: false },
    { player_id: 'me', lifetime_stars: 50, rank: 120, is_current_user: true },
  ], 'Thanh', 'Player');

  // rank 1 has no one to catch
  expect(result[0].starsToNextRank).toBeNull();
  // rank 119 follows rank 1 in the payload but is not adjacent to it — never
  // fabricate a 838-star "gap" across the discontinuity
  expect(result[1].starsToNextRank).toBeNull();
  expect(result[2].starsToNextRank).toBe(12);
});

test('a tie with the player above reports a zero gap, not a negative one', () => {
  const result = mapRemoteLeaderboardRows([
    { player_id: 'above', lifetime_stars: 50, rank: 9, is_current_user: false },
    { player_id: 'me', lifetime_stars: 50, rank: 10, is_current_user: true },
  ], 'Thanh', 'Player');
  expect(result[1].starsToNextRank).toBe(0);
});

test('rank gaps are flagged so the UI never draws distant rows as neighbours', () => {
  const [top, near] = mapRemoteLeaderboardRows([
    { player_id: 'top-50', lifetime_stars: 500, rank: 50, is_current_user: false },
    { player_id: 'me', lifetime_stars: 12, rank: 400, is_current_user: true },
  ], 'Thanh', 'Player');

  expect(hasRankGapBefore(top, undefined)).toBe(false);
  expect(hasRankGapBefore(near, top)).toBe(true);
});

test('consecutive ranks across the top-block boundary are not flagged as a gap', () => {
  const [fifty, fiftyOne] = mapRemoteLeaderboardRows([
    { player_id: 'top-50', lifetime_stars: 500, rank: 50, is_current_user: false },
    { player_id: 'me', lifetime_stars: 480, rank: 51, is_current_user: true },
  ], 'Thanh', 'Player');
  expect(hasRankGapBefore(fiftyOne, fifty)).toBe(false);
});

test('the render cap keeps the neighbourhood instead of slicing it off', () => {
  const rows = [
    ...Array.from({ length: 50 }, (_, i) => ({
      player_id: `top-${i + 1}`, lifetime_stars: 1000 - i, rank: i + 1, is_current_user: false,
    })),
    ...Array.from({ length: 11 }, (_, i) => ({
      player_id: `near-${i}`, lifetime_stars: 60 - i, rank: 995 + i, is_current_user: i === 5,
    })),
  ];
  const capped = capLeaderboardRows(mapRemoteLeaderboardRows(rows, 'Thanh', 'Player'), 50);

  expect(capped).toHaveLength(61);
  expect(capped.some(entry => entry.isCurrentUser)).toBe(true);
  expect(capped.filter(entry => entry.rank > 50)).toHaveLength(11);
});

test('the render cap drops distant out-of-contract rows', () => {
  const rows = [
    ...Array.from({ length: 50 }, (_, i) => ({
      player_id: `top-${i + 1}`, lifetime_stars: 1000 - i, rank: i + 1, is_current_user: false,
    })),
    { player_id: 'far-above', lifetime_stars: 90, rank: 990, is_current_user: false },
    { player_id: 'near-above', lifetime_stars: 70, rank: 995, is_current_user: false },
    { player_id: 'me', lifetime_stars: 60, rank: 1000, is_current_user: true },
    { player_id: 'far-below', lifetime_stars: 1, rank: 1100, is_current_user: false },
  ];
  const capped = capLeaderboardRows(mapRemoteLeaderboardRows(rows, 'Thanh', 'Player'), 50);

  expect(capped.some(entry => entry.playerId === 'far-above')).toBe(false);
  expect(capped.some(entry => entry.playerId === 'near-above')).toBe(true);
  expect(capped.some(entry => entry.playerId === 'me')).toBe(true);
  expect(capped.some(entry => entry.playerId === 'far-below')).toBe(false);
  expect(capped).toHaveLength(52);
});
