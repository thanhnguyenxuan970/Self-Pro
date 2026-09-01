import { displayStarsForRankRow } from '../src/lib/rankDisplay';

test('uses the local Analytics Year total for the current user when a row exists', () => {
  expect(displayStarsForRankRow({ isCurrentUser: true, yearStars: 999 }, 401)).toBe(401);
});

test('fails closed to zero when the current user local Analytics Year total is missing', () => {
  expect(displayStarsForRankRow({ isCurrentUser: true, yearStars: 999 }, null)).toBe(0);
});

test('keeps every other leaderboard row on its server Analytics Year total', () => {
  expect(displayStarsForRankRow({ isCurrentUser: false, yearStars: 999 }, 401)).toBe(999);
  expect(displayStarsForRankRow({ isCurrentUser: false, yearStars: 999.6 }, 401)).toBe(999);
});

test('does not copy the caller score into a rival row when its server score is missing', () => {
  expect(displayStarsForRankRow({ isCurrentUser: false, yearStars: null }, 401)).toBe(0);
});
