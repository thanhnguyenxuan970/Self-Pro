export interface WeeklyResetInput {
  lastActiveWeekStart: string | null;
  currentWeekStart: string;
}

export interface WeeklyResetResult {
  needsReset: boolean;
  weekToFinalize: string | null;
}

export function computeWeeklyReset(input: WeeklyResetInput): WeeklyResetResult {
  if (
    input.lastActiveWeekStart === null ||
    input.lastActiveWeekStart === input.currentWeekStart
  ) {
    return { needsReset: false, weekToFinalize: null };
  }
  return { needsReset: true, weekToFinalize: input.lastActiveWeekStart };
}
