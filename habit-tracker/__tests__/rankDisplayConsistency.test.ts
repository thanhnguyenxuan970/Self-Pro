import { displayStarsForRankRow } from '../src/lib/rankDisplay';

test('uses the Home local total for the current user when the leaderboard row is stale', () => {
  expect(displayStarsForRankRow({ isCurrentUser: true, lifetimeStars: 999 }, 401)).toBe(401);
});

test('keeps other leaderboard rows on their server totals', () => {
  expect(displayStarsForRankRow({ isCurrentUser: false, lifetimeStars: 999 }, 401)).toBe(999);
  expect(displayStarsForRankRow({ isCurrentUser: false, lifetimeStars: 999.6 }, 401)).toBe(999.6);
});
