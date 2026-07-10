import { getCurrentTier } from '../src/game/tierLookup';

const TIERS = [
  { id: 1, tier_order: 1, stars_required: 0,   rank_name: 'NPC',          reward_amount: 0 },
  { id: 2, tier_order: 2, stars_required: 5,   rank_name: 'Non Tơ',       reward_amount: 5000 },
  { id: 3, tier_order: 3, stars_required: 10,  rank_name: 'Tấu Hài',      reward_amount: 10000 },
  { id: 4, tier_order: 4, stars_required: 20,  rank_name: 'Cuốn Phết',    reward_amount: 20000 },
  { id: 5, tier_order: 5, stars_required: 40,  rank_name: 'Xịn Sò',       reward_amount: 40000 },
  { id: 6, tier_order: 6, stars_required: 80,  rank_name: 'Đỉnh Chóp',    reward_amount: 80000 },
  { id: 7, tier_order: 7, stars_required: 160, rank_name: 'U Là Trời',    reward_amount: 160000 },
];

describe('getCurrentTier', () => {
  test('0 stars → NPC', () => expect(getCurrentTier(0, TIERS)!.rank_name).toBe('NPC'));
  test('5 stars → Non Tơ', () => expect(getCurrentTier(5, TIERS)!.rank_name).toBe('Non Tơ'));
  test('9 stars → Non Tơ (not yet Tấu Hài)', () => expect(getCurrentTier(9, TIERS)!.rank_name).toBe('Non Tơ'));
  test('10 stars → Tấu Hài', () => expect(getCurrentTier(10, TIERS)!.rank_name).toBe('Tấu Hài'));
  test('200 stars → U Là Trời', () => expect(getCurrentTier(200, TIERS)!.rank_name).toBe('U Là Trời'));
});
