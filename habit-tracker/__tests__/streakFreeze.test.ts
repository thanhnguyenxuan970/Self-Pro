import { canPurchaseFreeze } from '../src/logic/streakFreeze';

const COST = 10;
const base = { treatStars: 50, existingFreeze: false, existingActivity: false, currentStreak: 5 };

describe('canPurchaseFreeze', () => {
  it('allows purchase when all conditions met', () => {
    expect(canPurchaseFreeze(base, COST)).toEqual({ allowed: true });
  });
  it('rejects when day already has activity', () => {
    expect(canPurchaseFreeze({ ...base, existingActivity: true }, COST))
      .toEqual({ allowed: false, reason: 'HAS_ACTIVITY' });
  });
  it('rejects when already frozen', () => {
    expect(canPurchaseFreeze({ ...base, existingFreeze: true }, COST))
      .toEqual({ allowed: false, reason: 'ALREADY_FROZEN' });
  });
  it('rejects when no active streak', () => {
    expect(canPurchaseFreeze({ ...base, currentStreak: 0 }, COST))
      .toEqual({ allowed: false, reason: 'NO_STREAK' });
  });
  it('rejects when insufficient stars', () => {
    expect(canPurchaseFreeze({ ...base, treatStars: 5 }, COST))
      .toEqual({ allowed: false, reason: 'INSUFFICIENT_FUNDS' });
  });
});
