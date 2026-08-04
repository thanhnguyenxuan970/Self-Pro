import { aggregateLifetimeStarsByPlayerId, buildRankedLeaderboard, mapRemoteLeaderboardRows } from '../src/queries/useLeaderboard';

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
  expect(result[0].displayName).toBe('Player #public');
  expect(result[1].displayName).toBe('Thanh');
  expect(result[1].isCurrentUser).toBe(true);
  expect(JSON.stringify(result)).not.toContain('@');
});
