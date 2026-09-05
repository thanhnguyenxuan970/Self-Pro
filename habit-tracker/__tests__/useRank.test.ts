jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn((options: unknown) => options),
}));
jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
jest.mock('../src/hooks/authContext', () => ({
  useGoogleUser: jest.fn(() => ({ email: 'user@example.com' })),
}));

import { getDb } from '../src/db/client';
import { useRankData, visibleTierId, type TierRow } from '../src/queries/useRank';

const mockUseGoogleUser = jest.requireMock('../src/hooks/authContext').useGoogleUser as jest.Mock;

const tiers: TierRow[] = [
  { id: 1, tier_order: 1, rank_name: 'Delulu', stars_required: 5 },
  { id: 2, tier_order: 2, rank_name: 'Mewing', stars_required: 10 },
];

test('keeps a reached high-water tier visible after a star correction', () => {
  expect(visibleTierId(1, 0, tiers)).toBe(1);
  expect(visibleTierId(1, 4, tiers)).toBe(1);
  expect(visibleTierId(1, 5, tiers)).toBe(1);
  expect(visibleTierId(1, 999, tiers)).toBe(1);
});

test('keeps only valid stored tiers visible', () => {
  expect(visibleTierId(null, 99, tiers)).toBeNull();
  expect(visibleTierId(999, 99, tiers)).toBeNull();
  expect(visibleTierId(2, 9, tiers)).toBe(2);
  expect(visibleTierId(2, 10, tiers)).toBe(2);
  expect(visibleTierId(2, 999, tiers)).toBe(2);
});

test('uses the Analytics Year star total as the Rank star anchor', async () => {
  const getFirstAsync = jest.fn()
    .mockResolvedValueOnce({ current_tier_id: 1 })
    .mockResolvedValueOnce({ total: 12 });
  const getAllAsync = jest.fn().mockResolvedValue(tiers);
  jest.mocked(getDb).mockResolvedValue({ getFirstAsync, getAllAsync } as never);

  const query = useRankData(7) as unknown as { queryFn: () => Promise<{ currentStars: number; currentTierId: number | null }> };
  await expect(query.queryFn()).resolves.toMatchObject({ currentStars: 12, currentTierId: 1 });
});

test('does not demote the stored lifetime tier when the Analytics Year resets', async () => {
  const getFirstAsync = jest.fn()
    .mockResolvedValueOnce({ current_tier_id: 2 })
    .mockResolvedValueOnce({ total: 0 });
  const getAllAsync = jest.fn().mockResolvedValue(tiers);
  jest.mocked(getDb).mockResolvedValue({ getFirstAsync, getAllAsync } as never);

  const query = useRankData(7) as unknown as { queryFn: () => Promise<{ currentStars: number; currentTierId: number | null }> };
  await expect(query.queryFn()).resolves.toMatchObject({ currentStars: 0, currentTierId: 2 });
});

test('handles a missing Google identity while loading Rank data', async () => {
  mockUseGoogleUser.mockReturnValueOnce(null);
  const getFirstAsync = jest.fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ total: 0 });
  const getAllAsync = jest.fn().mockResolvedValue([]);
  jest.mocked(getDb).mockResolvedValue({ getFirstAsync, getAllAsync } as never);
  const query = useRankData(7) as unknown as { queryFn: () => Promise<{ currentTierId: number | null }> };
  await expect(query.queryFn()).resolves.toMatchObject({ currentTierId: null });
});
