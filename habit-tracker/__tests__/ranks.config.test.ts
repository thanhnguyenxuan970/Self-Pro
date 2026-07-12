import { RANKS, getRankConfigByTierOrder, getRankThreshold } from '../src/config/ranks.config';

describe('rank config', () => {
  test('includes Final Boss and Ascended at the top of the ladder', () => {
    expect(RANKS[RANKS.length - 2]?.name).toBe('Final Boss');
    expect(RANKS[RANKS.length - 1]?.name).toBe('Ascended');
    expect(getRankConfigByTierOrder(8).nameVi).toBe('Trùm Cuối');
    expect(getRankConfigByTierOrder(9).nameVi).toBe('Đỉnh Của Chóp');
  });

  test('switches to doubling thresholds after GOATED', () => {
    expect(getRankThreshold(7)).toBe(320);
    expect(getRankThreshold(8)).toBe(640);
    expect(getRankThreshold(9)).toBe(1280);
    expect(getRankThreshold(10)).toBe(2560);
  });

  test('keeps the planned glow tiers and readable Mewing tilt', () => {
    expect(getRankConfigByTierOrder(4).glow).toBe('#2DD4BF');
    expect(getRankConfigByTierOrder(5).glow).toBe('#F472B6');
    expect(getRankConfigByTierOrder(7).glow).toBe('#FFE066');
    expect(getRankConfigByTierOrder(8).glow).toBe('#8B5CF6');
    expect(getRankConfigByTierOrder(2).anim.channels.rotate).toEqual([[0, -14], [0.5, -11], [1, -14]]);
    expect(getRankConfigByTierOrder(5).face.filter(el => el.t === 'line')).toHaveLength(8);
    expect(getRankConfigByTierOrder(9).glowOpacity).toBe(0.6);
  });
});
