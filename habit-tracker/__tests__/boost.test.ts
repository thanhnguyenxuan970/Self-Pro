import {
  boostEndOfDayMs,
  boostPalette,
  deriveBoostPhase,
  formatCountdown,
  isBoostActiveAt,
  nextBoostPhaseAt,
  secsRemaining,
  summarizeBoostLogs,
} from '../src/game/boost';
import type { AppColors } from '../src/config/theme';

const event = {
  multiplier: 2,
  claim_deadline: 1_000,
  claimed_at: null as number | null,
  expires_at: null as number | null,
  dismissed_at: null as number | null,
};

test('a streak-created boost is claimable before its deadline and only active after claim', () => {
  expect(deriveBoostPhase(500, event)).toBe('available');
  expect(isBoostActiveAt(500, event)).toBe(false);

  const claimed = { ...event, claimed_at: 600, expires_at: 600_000 };
  expect(deriveBoostPhase(700, claimed)).toBe('active');
  expect(isBoostActiveAt(599, claimed)).toBe(false);
  expect(isBoostActiveAt(700, claimed)).toBe(true);
  expect(isBoostActiveAt(600_000, claimed)).toBe(false);
});

test('a received boost remains available until local day end', () => {
  const morning = new Date('2025-05-27T09:59:00');
  const beforeDeadline = morning.getTime();
  const afterDeadline = beforeDeadline + 61_000;
  const received = { ...event, claim_deadline: boostEndOfDayMs(beforeDeadline) };

  expect(deriveBoostPhase(beforeDeadline, received)).toBe('available');
  expect(deriveBoostPhase(afterDeadline, received)).toBe('available');
  expect(deriveBoostPhase(boostEndOfDayMs(beforeDeadline), received)).toBe('none');
});

test('an expired boost stays expired after its summary is dismissed', () => {
  expect(deriveBoostPhase(2_000, {
    ...event,
    claimed_at: 100,
    expires_at: 1_000,
    dismissed_at: 1_500,
  })).toBe('expired');
});

test('summary counts only positive GOOD task stars and separates base from bonus', () => {
  expect(summarizeBoostLogs([
    { source: 'TASK', kind: 'GOOD', stars_delta: 2 },
    { source: 'TASK', kind: 'GOOD', stars_delta: 2 },
    { source: 'DAILY_BONUS', kind: 'DAILY_BONUS', stars_delta: 3 },
    { source: 'TASK', kind: 'BAD', stars_delta: -2 },
  ], 1)).toEqual({
    boostStars: 4,
    boostLogs: 2,
    baseStars: 2,
    bonusStars: 2,
    totalStars: 4,
  });
});

test('countdown uses hours for long windows and minutes for urgency', () => {
  expect(formatCountdown(84_668)).toBe('23:31:08');
  expect(formatCountdown(278)).toBe('04:38');
});

test('boost palette follows the selected theme tokens', () => {
  const colors = { primary: '#123456', primaryPress: '#654321', onAccent: '#FFFFFF' } as AppColors;
  expect(boostPalette(colors)).toEqual({
    fill: '#123456',
    border: '#654321',
    ink: '#FFFFFF',
  });
});

test('phase timer schedules only the next visual boundary', () => {
  const active = { ...event, claimed_at: 10_000, expires_at: 1_000_000 };
  expect(nextBoostPhaseAt(20_000, active)).toBe(700_000);
  expect(nextBoostPhaseAt(800_000, active)).toBe(1_000_000);
  expect(nextBoostPhaseAt(1_000_000, active)).toBeNull();
});

test('covers dismissed, expiring, fallback-expiry, and defensive timer states', () => {
  expect(deriveBoostPhase(10, null)).toBe('none');
  expect(deriveBoostPhase(10, { ...event, dismissed_at: 1 })).toBe('none');
  expect(deriveBoostPhase(2_000, event)).toBe('none');
  expect(deriveBoostPhase(95_000, { ...event, claim_deadline: 100_000 })).toBe('available');
  expect(deriveBoostPhase(100_000 + 29_000, { ...event, claimed_at: 100_000, expires_at: 200_000 })).toBe('expiring');
  expect(deriveBoostPhase(100_000 + 1_000, { ...event, claimed_at: 100_000, expires_at: null })).toBe('expired');
  expect(nextBoostPhaseAt(10, null)).toBeNull();
  expect(nextBoostPhaseAt(10, { ...event, dismissed_at: 1 })).toBeNull();
  expect(nextBoostPhaseAt(2_000, event)).toBeNull();
  expect(nextBoostPhaseAt(500, event)).toBe(1_000);
  expect(nextBoostPhaseAt(10, { ...event, claimed_at: 100, expires_at: null })).toBe(100);
  expect(isBoostActiveAt(10, null)).toBe(false);
  expect(isBoostActiveAt(10, { ...event, claimed_at: 1, expires_at: null })).toBe(false);
  expect(secsRemaining(10, null)).toBe(0);
  expect(secsRemaining(10, 2_010)).toBe(2);
  expect(formatCountdown(-1)).toBe('00:00');
});
