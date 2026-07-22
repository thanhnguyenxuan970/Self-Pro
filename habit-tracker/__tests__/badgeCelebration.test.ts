import { badgeCelebrationFormat } from '../src/lib/badgeCelebration';

test('only common badge tiers use the non-blocking sheet', () => {
  expect(badgeCelebrationFormat('iron')).toBe('sheet');
  expect(badgeCelebrationFormat('bronze')).toBe('sheet');
  expect(badgeCelebrationFormat('silver')).toBe('takeover');
  expect(badgeCelebrationFormat('gold')).toBe('takeover');
  expect(badgeCelebrationFormat('platinum')).toBe('takeover');
  expect(badgeCelebrationFormat('diamond')).toBe('takeover');
});
