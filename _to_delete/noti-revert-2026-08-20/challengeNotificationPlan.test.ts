import {
  ChallengeReminderState,
  MAX_SCHEDULED_SLOTS,
  REMINDER_HORIZON_DAYS,
  isChallengeAtRisk,
  planAllChallengeReminders,
  planChallengeReminders,
  reminderIdentifier,
} from '../src/lib/challengeNotificationPlan';

const MORNING = 8 * 60; // 08:00, before every slot of the day

function state(overrides: Partial<ChallengeReminderState> = {}): ChallengeReminderState {
  return {
    challengeId: 1,
    challengeName: 'Đọc sách',
    mode: 'streak',
    status: 'active',
    notificationsEnabled: true,
    loggedToday: false,
    atRisk: false,
    ...overrides,
  };
}

describe('isChallengeAtRisk', () => {
  test('streak is at risk only once the last freeze is gone', () => {
    expect(isChallengeAtRisk({ mode: 'streak', freezesLeft: 1, weekPaceState: null })).toBe(false);
    expect(isChallengeAtRisk({ mode: 'streak', freezesLeft: 0, weekPaceState: null })).toBe(true);
  });

  test('weekly is at risk on behind, never on impossible', () => {
    expect(isChallengeAtRisk({ mode: 'weekly', freezesLeft: 0, weekPaceState: 'on_pace' })).toBe(false);
    expect(isChallengeAtRisk({ mode: 'weekly', freezesLeft: 0, weekPaceState: 'behind' })).toBe(true);
    // The window is already lost -- escalating about it is pure noise.
    expect(isChallengeAtRisk({ mode: 'weekly', freezesLeft: 0, weekPaceState: 'impossible' })).toBe(false);
  });
});

describe('planChallengeReminders', () => {
  test('lays down one normal slot per day across the horizon', () => {
    const slots = planChallengeReminders(state(), { nowMinutes: MORNING });
    expect(slots).toHaveLength(REMINDER_HORIZON_DAYS);
    expect(slots.every(slot => slot.hour === 20 && slot.minute === 0 && slot.tone === 'normal')).toBe(true);
    expect(slots.map(slot => slot.dayOffset)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test('a failed challenge schedules nothing at all', () => {
    expect(planChallengeReminders(state({ status: 'failed' }), { nowMinutes: MORNING })).toEqual([]);
  });

  test('a finished challenge schedules nothing at all', () => {
    expect(planChallengeReminders(state({ status: 'done' }), { nowMinutes: MORNING })).toEqual([]);
  });

  test('reminders turned off schedules nothing at all', () => {
    expect(planChallengeReminders(state({ notificationsEnabled: false }), { nowMinutes: MORNING })).toEqual([]);
  });

  test('already logged today drops only today, keeps the rest of the horizon', () => {
    const slots = planChallengeReminders(state({ loggedToday: true }), { nowMinutes: MORNING });
    expect(slots.map(slot => slot.dayOffset)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('at risk and unlogged adds the 21:30 escalation for today only', () => {
    const slots = planChallengeReminders(state({ atRisk: true }), { nowMinutes: MORNING });
    const urgent = slots.filter(slot => slot.tone === 'urgent');
    expect(urgent).toHaveLength(1);
    expect(urgent[0]).toMatchObject({ dayOffset: 0, hour: 21, minute: 30 });
    expect(urgent[0].identifier).toBe(reminderIdentifier(1, 0, 'urgent'));
  });

  test('at risk but already logged gets no escalation', () => {
    const slots = planChallengeReminders(state({ atRisk: true, loggedToday: true }), { nowMinutes: MORNING });
    expect(slots.some(slot => slot.tone === 'urgent')).toBe(false);
  });

  test('never escalates for a future day, because tomorrow\'s risk is unknown today', () => {
    const slots = planChallengeReminders(state({ atRisk: true }), { nowMinutes: MORNING });
    expect(slots.filter(slot => slot.tone === 'urgent').every(slot => slot.dayOffset === 0)).toBe(true);
  });

  test('slots already past for today are skipped, tomorrow onward is kept', () => {
    // 22:00 -- both of today's slots have gone by.
    const slots = planChallengeReminders(state({ atRisk: true }), { nowMinutes: 22 * 60 });
    expect(slots.some(slot => slot.dayOffset === 0)).toBe(false);
    expect(slots.map(slot => slot.dayOffset)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('between the two slots, only the escalation is still schedulable', () => {
    // 20:30 -- the 20:00 nudge has passed, the 21:30 one has not.
    const slots = planChallengeReminders(state({ atRisk: true }), { nowMinutes: 20 * 60 + 30 });
    const today = slots.filter(slot => slot.dayOffset === 0);
    expect(today).toHaveLength(1);
    expect(today[0].tone).toBe('urgent');
  });
});

describe('planAllChallengeReminders', () => {
  test('escalations outrank every normal slot under the global cap', () => {
    const many = Array.from({ length: 12 }, (_, index) => state({
      challengeId: index + 1,
      // Only the last challenge is at risk; its escalation must survive.
      atRisk: index === 11,
    }));

    const slots = planAllChallengeReminders(many, { nowMinutes: MORNING });

    expect(slots).toHaveLength(MAX_SCHEDULED_SLOTS);
    expect(slots[0]).toMatchObject({ challengeId: 12, tone: 'urgent' });
  });

  test('nearest days win over far days when truncating', () => {
    const many = Array.from({ length: 12 }, (_, index) => state({ challengeId: index + 1 }));
    const slots = planAllChallengeReminders(many, { nowMinutes: MORNING });

    // 12 challenges x day 0..3 = 48, then 2 of day 4. Nothing beyond day 4.
    expect(slots.filter(slot => slot.dayOffset === 0)).toHaveLength(12);
    expect(slots.every(slot => slot.dayOffset <= 4)).toBe(true);
  });

  test('identifiers are unique so the OS queue never collides', () => {
    const slots = planAllChallengeReminders(
      [state({ challengeId: 1, atRisk: true }), state({ challengeId: 2 })],
      { nowMinutes: MORNING },
    );
    expect(new Set(slots.map(slot => slot.identifier)).size).toBe(slots.length);
  });
});
