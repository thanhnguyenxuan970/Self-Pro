import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { AppColors, Radii } from '../config/theme';
import { useTheme } from '../hooks/useSettings';
import { dayCellStates, GRID_CELL_COUNT } from '../lib/challenge';
import type { DayCellState, DayEntryState } from '../lib/challenge';

type Props = {
  targetDays: number;
  startDate: string;
  log: { date: string; state: DayEntryState }[];
  today: string;
  atRisk?: boolean;
  accessibilityLabel: string;
};

/**
 * One-row day-track strip for the challenge list card. Reuses dayCellStates()
 * (same 30-day windowing as ChallengeDayGrid) so a long run windows to the
 * last 30 days with absolute day positions — just rendered as slim color bars
 * instead of numbered icon cells. dayCellStates() always returns a fixed
 * GRID_CELL_COUNT-length array (it pads a short run with 'future' filler so
 * ChallengeDayGrid can lay out a full rectangle); the card strip trims that
 * filler so a short run renders exactly targetDays segments, not 30 slivers.
 */
export const ChallengeDayTrack = React.memo(function ChallengeDayTrack({ targetDays, startDate, log, today, atRisk = false, accessibilityLabel }: Props) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const cells = useMemo(
    () => dayCellStates(startDate, targetDays, log, today).slice(0, Math.min(targetDays, GRID_CELL_COUNT)),
    [startDate, targetDays, log, today],
  );

  let brokeAlready = false;

  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel}>
      {cells.map(cell => {
        const dimmed = brokeAlready;
        if (cell.state === 'reset') brokeAlready = true;
        if (cell.state === 'today') {
          return (
            <View
              key={cell.label}
              style={[styles.segment, styles.todaySegment, { borderColor: atRisk ? C.danger : C.primary }, dimmed && styles.dimmed]}
            />
          );
        }
        return (
          <View
            key={cell.label}
            style={[styles.segment, { backgroundColor: segmentColor(cell.state, C) }, dimmed && styles.dimmed]}
          />
        );
      })}
    </View>
  );
});

function segmentColor(state: DayCellState, C: AppColors): string {
  switch (state) {
    case 'done': return C.primary;
    case 'freeze': return C.starGold;
    case 'reset': return C.danger;
    default: return C.surface3;
  }
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', gap: 4, alignSelf: 'stretch' },
    segment: { flex: 1, height: 8, borderRadius: Radii.pill },
    todaySegment: { backgroundColor: C.surface3, borderWidth: 1.5 },
    dimmed: { opacity: 0.5 },
  });
}
