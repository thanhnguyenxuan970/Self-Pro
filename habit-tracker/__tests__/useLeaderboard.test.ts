import { aggregateStarsByEmail, buildRankedLeaderboard, emailPrefix } from '../src/queries/useLeaderboard';

test('emailPrefix strips the domain', () => {
  expect(emailPrefix('sarah@example.com')).toBe('sarah');
  expect(emailPrefix('no-at-sign')).toBe('no-at-sign');
});

test('aggregateStarsByEmail sums stars_delta per user across all rows, no week/tier filter', () => {
  const map = aggregateStarsByEmail([
    { user_email: 'a@x.com', stars_delta: 10 },
    { user_email: 'a@x.com', stars_delta: 5 },
    { user_email: 'b@x.com', stars_delta: 3 },
    { user_email: 'a@x.com', stars_delta: null },
  ]);
  expect(map.get('a@x.com')).toBe(15);
  expect(map.get('b@x.com')).toBe(3);
});

test('global sort is strictly by lifetime score descending — rank 1 is the highest score', () => {
  const map = new Map([
    ['low@x.com', 5],
    ['high@x.com', 100],
    ['mid@x.com', 40],
  ]);
  const result = buildRankedLeaderboard(map, null);
  expect(result.map(e => e.userEmail)).toEqual(['high@x.com', 'mid@x.com', 'low@x.com']);
  expect(result.map(e => e.rank)).toEqual([1, 2, 3]);
});

test('every player appears — no tier-band filtering, unlike the old per-tier leaderboard', () => {
  const map = new Map([
    ['zero@x.com', 0],
    ['whale@x.com', 5000],
  ]);
  const result = buildRankedLeaderboard(map, null);
  expect(result).toHaveLength(2);
});

test('ties break on userEmail ascending for a stable, deterministic order', () => {
  const map = new Map([
    ['zoe@x.com', 20],
    ['amy@x.com', 20],
    ['mike@x.com', 20],
  ]);
  const result = buildRankedLeaderboard(map, null);
  expect(result.map(e => e.userEmail)).toEqual(['amy@x.com', 'mike@x.com', 'zoe@x.com']);
});

test('marks the current user and never fabricates a negative star count', () => {
  const map = new Map([['me@x.com', -3], ['other@x.com', 10]]);
  const result = buildRankedLeaderboard(map, 'me@x.com');
  const me = result.find(e => e.userEmail === 'me@x.com')!;
  expect(me.isCurrentUser).toBe(true);
  expect(me.lifetimeStars).toBe(0);
});
