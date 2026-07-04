export type DayEntryState = 'done' | 'reset' | 'freeze';
export type ChallengeStatus = 'active' | 'done' | 'failed';

export type DayEntry = { date: string; state: DayEntryState };
export type Challenge = {
  id: number;
  name: string;
  taskType: number | null;
  targetDays: number;
  startDate: string;
  status: ChallengeStatus;
  log: DayEntry[];
  freezesLeft: number;
  beforePhoto?: string | null;
  afterPhoto?: string | null;
};

export const CHALLENGE_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function challengeDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CHALLENGE_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function dayNumber(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

export function dateRange(from: string, to: string): string[] {
  const result: string[] = [];
  for (let day = dayNumber(from), end = dayNumber(to); day <= end; day++) {
    result.push(new Date(day * 86_400_000).toISOString().slice(0, 10));
  }
  return result;
}

export function currentDay(challenge: Pick<Challenge, 'startDate'>, now: Date = new Date()): number {
  return dayNumber(challengeDate(now)) - dayNumber(challenge.startDate);
}

export function currentDayIndex(startDate: string, today: string): number {
  return dayNumber(today) - dayNumber(startDate);
}

export function progress(challenge: Pick<Challenge, 'log' | 'targetDays'>) {
  return computeProgress(challenge.log.filter(day => day.state === 'done').length, challenge.targetDays);
}

export function challengeStreak(log: DayEntry[]): number {
  let streak = 0;
  for (let index = log.length - 1; index >= 0 && log[index].state !== 'reset'; index--) streak++;
  return streak;
}

export function computeProgress(daysDone: number, targetDays: number): { fraction: number; daysLeft: number } {
  return {
    fraction: targetDays > 0 ? Math.min(1, daysDone / targetDays) : 0,
    daysLeft: Math.max(0, targetDays - daysDone),
  };
}

export const isComplete = (daysDone: number, targetDays: number) => daysDone >= targetDays;

export function completeChallenge(challenge: Challenge) {
  return { challenge: { ...challenge, status: 'done' as const }, celebrate: true, reward: 'completion' as const };
}

export function logToday(challenge: Challenge, today = challengeDate()) {
  if (challenge.status !== 'active' || challenge.log.some(day => day.date === today)) return challenge;
  const next = { ...challenge, log: [...challenge.log, { date: today, state: 'done' as const }] };
  return progress(next).daysLeft === 0 ? completeChallenge(next).challenge : next;
}

export function computeRollover(input: {
  startDate: string;
  today: string;
  loggedDates: Set<string>;
  freezesLeft: number;
}) {
  const fillDays: DayEntry[] = [];
  let freezesLeft = input.freezesLeft;
  if (input.today <= input.startDate) return { fillDays, freezesLeft, failed: false as const };

  for (const date of dateRange(input.startDate, input.today).slice(0, -1)) {
    if (input.loggedDates.has(date)) continue;
    if (freezesLeft > 0) {
      freezesLeft--;
      fillDays.push({ date, state: 'freeze' });
    } else {
      fillDays.push({ date, state: 'reset' });
      return { fillDays, freezesLeft, failed: true as const, failDate: date };
    }
  }
  return { fillDays, freezesLeft, failed: false as const };
}

export function restart(challenge: Challenge, startDate = challengeDate()): Challenge {
  return { ...challenge, id: 0, startDate, status: 'active', log: [], freezesLeft: 1, afterPhoto: null };
}
