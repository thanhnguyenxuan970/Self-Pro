import { getRankConfigByTierOrder } from '../src/config/ranks.config';
import { getCelebrationGlowColor, shouldRunCelebrationBurst, shouldRunRankLoop } from '../src/lib/rankPresentation';

describe('rank celebration behavior', () => {
  test('uses dedicated glow colors for the top rank tiers', () => {
    expect(getCelebrationGlowColor(8)).toBe(getRankConfigByTierOrder(8).glow);
    expect(getCelebrationGlowColor(9)).toBe(getRankConfigByTierOrder(9).glow);
    expect(getCelebrationGlowColor(10)).toBe('#FF8C42');
  });

  test('disables celebration burst when reduced motion is enabled', () => {
    expect(shouldRunCelebrationBurst(true, true)).toBe(false);
    expect(shouldRunCelebrationBurst(true, false)).toBe(true);
    expect(shouldRunCelebrationBurst(false, false)).toBe(false);
  });

  test('disables mascot loop when reduced motion is enabled', () => {
    expect(shouldRunRankLoop({ reduceMotion: true, loop: true, hasLoopAnimation: true })).toBe(false);
    expect(shouldRunRankLoop({ reduceMotion: false, loop: false, hasLoopAnimation: true })).toBe(false);
    expect(shouldRunRankLoop({ reduceMotion: false, loop: true, hasLoopAnimation: false })).toBe(false);
    expect(shouldRunRankLoop({ reduceMotion: false, loop: true, hasLoopAnimation: true })).toBe(true);
  });
});
