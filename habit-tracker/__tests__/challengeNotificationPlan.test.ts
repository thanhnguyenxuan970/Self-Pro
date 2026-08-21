import {
  addDays,
  challengeReminderPrefix,
  planAllChallengeReminders,
  planChallengeReminders,
  reminderIdentifier,
  type ChallengeReminderState,
} from '../src/lib/challengeNotificationPlan';

const NOW = new Date(2026, 7, 21, 8, 0, 0, 0);

function state(overrides: Partial<ChallengeReminderState> = {}): ChallengeReminderState {
  return {
    challengeId: 1,
    challengeName: 'Read',
    mode: 'streak',
    status: 'active',
    notificationsEnabled: true,
    loggedToday: false,
    freezesLeft: 1,
    weekPaceState: null,
    weekEnd: null,
    today: '2026-08-21',
    ...overrides,
  };
}

test('normal encouragement uses a seven-day one-shot horizon without a hidden cap', () => {
  const slots = planChallengeReminders(state(), { now: NOW });

  expect(slots).toHaveLength(7);
  expect(slots[0]).toMatchObject({ tone: 'normal', challengeId: 1 });
  expect(slots[0].triggerAt).toEqual(new Date(2026, 7, 21, 20, 0, 0, 0));
  expect(slots[0].identifier).toBe(reminderIdentifier(1, 'normal', '2026-08-21'));
  expect(slots[6].identifier).toBe(reminderIdentifier(1, 'normal', '2026-08-27'));
});

test('logged today removes today and outcome slots but keeps future horizon slots', () => {
  const slots = planChallengeReminders(state({ loggedToday: true, freezesLeft: 0 }), { now: NOW });
  expect(slots).toHaveLength(6);
  expect(slots.every(slot => slot.tone === 'normal')).toBe(true);
  expect(slots.some(slot => slot.identifier.includes('2026-08-21'))).toBe(false);
});

test('an at-risk streak gets a truthful next-morning outcome notification', () => {
  const slots = planChallengeReminders(state({ freezesLeft: 0 }), { now: NOW });
  expect(slots.map(slot => slot.tone)).toEqual(['normal', 'outcome']);
  expect(slots.filter(slot => slot.tone === 'normal')).toHaveLength(1);
  expect(slots[1].triggerAt).toEqual(new Date(2026, 7, 22, 9, 0, 0, 0));
  expect(slots[1].identifier).toBe(reminderIdentifier(1, 'outcome', addDays('2026-08-21', 1)));
});

test('weekly impossible pace schedules the outcome after the window', () => {
  const slots = planChallengeReminders(state({
    mode: 'weekly',
    weekPaceState: 'impossible',
    weekEnd: '2026-08-23',
  }), { now: NOW });

  expect(slots).toHaveLength(1);
  expect(slots.find(slot => slot.tone === 'outcome')?.triggerAt)
    .toEqual(new Date(2026, 7, 24, 9, 0, 0, 0));
});

test('terminal or disabled Challenges schedule nothing', () => {
  expect(planChallengeReminders(state({ status: 'failed' }), { now: NOW })).toEqual([]);
  expect(planChallengeReminders(state({ notificationsEnabled: false }), { now: NOW })).toEqual([]);
});

test('an explicit platform budget reports omissions instead of hiding them', () => {
  const result = planAllChallengeReminders(
    Array.from({ length: 4 }, (_, index) => state({ challengeId: index + 1 })),
    { now: NOW, maxSlots: 2 },
  );

  expect(result.candidateCount).toBe(28);
  expect(result.slots).toHaveLength(2);
  expect(result.omittedCount).toBe(26);
  expect(challengeReminderPrefix(1)).toBe('habi-ch-1-');
});
