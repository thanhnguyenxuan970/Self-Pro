import {
  STARS_PER_TASK,
  DAILY_BONUS_THRESHOLD,
  DAILY_BONUS_STARS,
  TIME_UNIT_MINUTES,
  SOURCE_TASK,
  SOURCE_DAILY_BONUS,
} from '../constants';
import { computeStars } from './points';

export interface ComputeInput {
  userId: number;
  taskTypeId: number | null;
  kind: 'GOOD' | 'BAD';
  isTimeBased: boolean;
  basePoints: number;
  starPenalty: number;
  durationMin?: number;
  currentDayPoints: number;
  bonusAlreadyAwarded: boolean;
  loggedAt: Date;
  localDate: string;
  weekStart: string;
}

interface ActivityRow {
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

interface ComputeResult {
  activityRow: ActivityRow;
  bonusRow: ActivityRow | null;
}

export function computeLogTaskRows(input: ComputeInput): ComputeResult {
  const ts = input.loggedAt.getTime();

  let pointsEarned: number;
  let starsDelta: number;

  if (input.kind === 'GOOD') {
    if (input.isTimeBased) {
      pointsEarned = Math.max(1, Math.floor((input.durationMin ?? 0) / TIME_UNIT_MINUTES));
      starsDelta = Math.max(1, computeStars(input.durationMin ?? 0));
    } else {
      pointsEarned = input.basePoints;
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
    !input.bonusAlreadyAwarded &&
    newDayPoints >= DAILY_BONUS_THRESHOLD
  ) {
    bonusRow = {
      user_id: input.userId,
      task_type_id: null,
      kind: 'DAILY_BONUS',
      duration_min: null,
      points_earned: 0,
      stars_delta: DAILY_BONUS_STARS,
      source: SOURCE_DAILY_BONUS,
      logged_at: ts,
      local_date: input.localDate,
      week_start: input.weekStart,
    };
  }

  return { activityRow, bonusRow };
}
