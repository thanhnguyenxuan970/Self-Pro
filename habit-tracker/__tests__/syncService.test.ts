const mockGetSession = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn(() => ({ upsert: mockUpsert }));

jest.mock('../src/api/supabase', () => ({
  supabase: { auth: { getSession: mockGetSession }, from: mockFrom },
}));

jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));

import { syncUserStreak } from '../src/api/syncService';

describe('syncUserStreak', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not upsert when Supabase has no authenticated session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await syncUserStreak('user@example.com', 7);

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('upserts only after confirming an authenticated session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: {} } });
    mockUpsert.mockResolvedValue({ error: null });

    await syncUserStreak('user@example.com', 7);

    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockUpsert).toHaveBeenCalledWith(
      { user_email: 'user@example.com', current_streak: 7 },
      { onConflict: 'user_email' },
    );
  });
});
