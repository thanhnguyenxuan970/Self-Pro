import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppColors, FontFamily, Radii, Spacing } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { dayCellStates, GRID_CELL_COUNT } from '../lib/challenge';
import type { DayCellState as CellState, DayEntryState as ChallengeLogState } from '../lib/challenge';

export { GRID_CELL_COUNT };

type Props = {
  targetDays: number;
  startDate: string;
  log: { date: string; state: ChallengeLogState }[];
  today: string;
  atRisk?: boolean;
};

export const ChallengeDayGrid = React.memo(function ChallengeDayGrid({ targetDays, startDate, log, today, atRisk = false }: Props) {
  const { colors: C } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(C), [C]);
  const cells = useMemo(() => dayCellStates(startDate, targetDays, log, today), [startDate, targetDays, log, today]);

  const stateLabel: Record<CellState, string> = {
    done: t.challengeDayStateDone,
    freeze: t.challengeDayStateFreeze,
    today: t.challengeDayStateToday,
    future: t.challengeDayStateFuture,
    reset: t.challengeDayStateReset,
  };

  function cellColor(state: CellState): string {
    switch (state) {
      case 'done': return C.primary;
      case 'freeze': return C.starSoft;
      case 'today': return 'transparent';
      case 'future': return 'transparent';
      case 'reset': default: return C.dangerSoft;
    }
  }

  function cellGlyph(state: CellState, isAtRiskToday: boolean): string | null {
    switch (state) {
      case 'done': return '✓';
      case 'freeze': return '🧊';
      case 'today': return isAtRiskToday ? '!' : '🔥';
      case 'reset': return '💔';
      default: return null;
    }
  }

  function glyphColor(state: CellState, isAtRiskToday: boolean): string {
    if (state === 'done') return C.onAccent;
    if (state === 'freeze') return C.starGoldText;
    if (isAtRiskToday) return C.dangerText;
    return C.primaryText;
  }

  return (
    <View style={styles.grid}>
      {cells.map(cell => {
        const isAtRiskToday = atRisk && cell.state === 'today';
        const glyph = cellGlyph(cell.state, isAtRiskToday);
        return (
          <View
            key={cell.label}
            style={[
              styles.cell,
              { backgroundColor: cellColor(cell.state) },
              cell.state === 'today' && { borderWidth: 2, borderColor: isAtRiskToday ? C.danger : C.primary },
            ]}
            accessible
            accessibilityLabel={`${cell.label}: ${stateLabel[cell.state]}`}
          >
            {glyph
              ? <Text style={[styles.cellGlyphMain, { color: glyphColor(cell.state, isAtRiskToday) }]}>{glyph}</Text>
              : <Text style={styles.cellText}>{cell.label}</Text>}
          </View>
        );
      })}
    </View>
  );
});

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignSelf: 'stretch',
      justifyContent: 'space-between',
      rowGap: 8,
    },
    cell: {
      width: '14.6%',
      aspectRatio: 1,
      borderRadius: Radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    cellText: { fontSize: 14, fontFamily: FontFamily.bold, color: C.faint },
    cellGlyphMain: { fontSize: 18, lineHeight: 22, color: C.primaryText },
  });
}
