import { canEnjoyTreat, decorateTreat } from '../src/logic/treatLogic';

const baseTreat = {
  id: 1, user_id: 1, name: 'Bubble tea', icon: 'gift',
  target_stars: 50, approx_amount: 50000, currency: 'VND',
  status: 'ACTIVE' as const, sort_order: 0,
  reached_at: null, enjoyed_at: null, created_at: '2026-01-01T00:00:00',
};

describe('canEnjoyTreat', () => {
  it('allows when pool >= target and status ACTIVE', () => {
    expect(canEnjoyTreat(baseTreat, 50)).toEqual({ allowed: true });
  });
  it('rejects when pool < target', () => {
    expect(canEnjoyTreat(baseTreat, 49)).toEqual({ allowed: false, reason: 'NOT_ENOUGH_STARS' });
  });
  it('rejects when already enjoyed', () => {
    expect(canEnjoyTreat({ ...baseTreat, status: 'ENJOYED' }, 100)).toEqual({ allowed: false, reason: 'ALREADY_ENJOYED' });
  });
  it('rejects when archived', () => {
    expect(canEnjoyTreat({ ...baseTreat, status: 'ARCHIVED' }, 100)).toEqual({ allowed: false, reason: 'ALREADY_ENJOYED' });
  });
});

describe('decorateTreat', () => {
  it('unlockable when pool >= target', () => {
    const d = decorateTreat(baseTreat, 60);
    expect(d.unlockable).toBe(true);
    expect(d.starsToUnlock).toBe(0);
    expect(d.progressPct).toBe(100);
  });
  it('starsToUnlock correct when partial progress', () => {
    const d = decorateTreat(baseTreat, 25);
    expect(d.unlockable).toBe(false);
    expect(d.starsToUnlock).toBe(25);
    expect(d.progressPct).toBe(50);
  });
  it('progressPct caps at 100', () => {
    const d = decorateTreat(baseTreat, 200);
    expect(d.progressPct).toBe(100);
  });
  it('progressPct 0 when no stars', () => {
    const d = decorateTreat(baseTreat, 0);
    expect(d.progressPct).toBe(0);
  });
});
