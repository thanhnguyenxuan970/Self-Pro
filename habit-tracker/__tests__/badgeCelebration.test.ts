import { badgeCelebrationFormat, getBadgeConfettiCount, getBadgeRarity } from '../src/lib/badgeCelebration';

test('only common badge tiers use the non-blocking sheet', () => {
  expect(badgeCelebrationFormat('iron')).toBe('sheet');
  expect(badgeCelebrationFormat('bronze')).toBe('sheet');
  expect(badgeCelebrationFormat('silver')).toBe('takeover');
  expect(badgeCelebrationFormat('gold')).toBe('takeover');
  expect(badgeCelebrationFormat('platinum')).toBe('takeover');
  expect(badgeCelebrationFormat('diamond')).toBe('takeover');
});

test('maps tiers to the plan rarity ladder', () => {
  expect(getBadgeRarity('bronze')).toEqual({ kind: 'common', percent: 62, color: '#8A9490' });
  expect(getBadgeRarity('silver')).toEqual({ kind: 'rare', percent: 12, color: '#60A5FA' });
  expect(getBadgeRarity('gold')).toEqual({ kind: 'veryRare', percent: 5, color: '#FB923C' });
  expect(getBadgeRarity('platinum')).toEqual({ kind: 'legendary', percent: 1, color: '#A78BFA' });
});

test('uses the plan confetti counts for each celebration tier', () => {
  expect(getBadgeConfettiCount('bronze')).toBe(14);
  expect(getBadgeConfettiCount('silver')).toBe(24);
  expect(getBadgeConfettiCount('gold')).toBe(34);
  expect(getBadgeConfettiCount('platinum')).toBe(46);
});
