import React from 'react';
import { BackfillSheet } from './BackfillSheet';
import type { StreakMilestone } from '../game/streakMilestones';

interface BackfillFlowProps {
  backfillDate: string | null;
  setBackfillDate: (date: string | null) => void;
  backfillsUsedThisWeek: number | undefined;
  userId: number;
  setPendingStreakMilestone: (milestone: StreakMilestone) => void;
}

/** Wires BackfillSheet's open/close state to the streak-milestone celebration
 *  that can fire from within it. Shared by every screen that offers backfill. */
export function BackfillFlow({
  backfillDate, setBackfillDate, backfillsUsedThisWeek, userId, setPendingStreakMilestone,
}: BackfillFlowProps) {
  return (
    <BackfillSheet
      visible={!!backfillDate}
      date={backfillDate ?? ''}
      backfillsUsedThisWeek={backfillsUsedThisWeek ?? 0}
      userId={userId}
      onMilestone={(milestone) => {
        setBackfillDate(null);
        setPendingStreakMilestone(milestone);
      }}
      onClose={() => setBackfillDate(null)}
    />
  );
}
