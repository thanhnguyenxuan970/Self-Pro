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
});
