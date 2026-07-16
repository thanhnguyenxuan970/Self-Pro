import {
  STARS_PER_TASK,
  POINTS_PER_UNTIMED_ACTIVITY,
  TIME_UNIT_MINUTES,
  dailyBonusStarsForPoints,
  SOURCE_TASK,
  SOURCE_DAILY_BONUS,
} from '../config/constants';

export interface ComputeInput {
  userId: number;
  taskTypeId: number | null;
  kind: 'GOOD' | 'BAD';
  isTimeBased: boolean;
  basePoints: number;
  starPenalty: number;
  durationMin?: number;
  currentDayPoints: number;
  bonusStarsAwarded: number;
  loggedAt: Date;
  localDate: string;
  weekStart: string;
}

export interface ActivityRow {
  user_id: number;
  task_type_id: number | null;
  kind: string;
  duration_min: number | null;
  points_earned: number;
  stars_delta: number;
  source: string;
  logged_at: number;
  local_date: string;
  week_start: string;
}

export interface ComputeResult {
  activityRow: ActivityRow;
  bonusRow: ActivityRow | null;
}

export function computeLogTaskRows(input: ComputeInput): ComputeResult {
  const ts = input.loggedAt.getTime();

  let pointsEarned: number;
  let starsDelta: number;

  if (input.kind === 'GOOD') {
    if (input.isTimeBased) {
      pointsEarned = Math.max(1, Math.ceil((input.durationMin ?? 0) / TIME_UNIT_MINUTES));
      starsDelta = STARS_PER_TASK;
    } else {
      pointsEarned = POINTS_PER_UNTIMED_ACTIVITY;
      starsDelta = STARS_PER_TASK;
    }
  } else {
    pointsEarned = 0;
    starsDelta = -input.starPenalty;
  }

  const activityRow: ActivityRow = {
    user_id: input.userId,
    task_type_id: input.taskTypeId,
    kind: input.kind,
    duration_min: input.durationMin ?? null,
    points_earned: pointsEarned,
    stars_delta: starsDelta,
    source: SOURCE_TASK,
    logged_at: ts,
    local_date: input.localDate,
    week_start: input.weekStart,
  };

  let bonusRow: ActivityRow | null = null;
  const newDayPoints = input.currentDayPoints + pointsEarned;
  if (
    input.kind === 'GOOD' &&
    dailyBonusStarsForPoints(newDayPoints) > input.bonusStarsAwarded
  ) {
    bonusRow = {
      user_id: input.userId,
      task_type_id: input.taskTypeId,
      kind: 'DAILY_BONUS',
      duration_min: null,
      points_earned: 0,
      stars_delta: dailyBonusStarsForPoints(newDayPoints) - input.bonusStarsAwarded,
      source: SOURCE_DAILY_BONUS,
      logged_at: ts,
      local_date: input.localDate,
      week_start: input.weekStart,
    };
  }

  return { activityRow, bonusRow };
}
