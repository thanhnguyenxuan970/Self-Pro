import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppColors, FontFamily, Radii, Spacing } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { currentDayIndex } from '../lib/challenge';
import type { DayEntryState as ChallengeLogState } from '../lib/challenge';

type CellState = ChallengeLogState | 'today' | 'future';
type Cell = { label: number; state: CellState };

export const GRID_CELL_COUNT = 30;

type Props = {
  targetDays: number;
  startDate: string;
  log: { date: string; state: ChallengeLogState }[];
  today: string;
};

function formatDateAtOffset(startDate: string, offset: number): string {
  const date = new Date(`${startDate}T12:00:00`);
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayCellStates(startDate: string, targetDays: number, log: { date: string; state: ChallengeLogState }[], today: string): Cell[] {
  const byDate = new Map(log.map(l => [l.date, l.state]));
  const todayIndex = currentDayIndex(startDate, today);
  const maxWindowStart = Math.max(0, targetDays - GRID_CELL_COUNT);
  const windowStart = Math.min(Math.max(0, todayIndex - (GRID_CELL_COUNT - 1)), maxWindowStart);
  const cells: Cell[] = [];

  for (let i = 0; i < GRID_CELL_COUNT; i++) {
    const dayIndex = windowStart + i;
    const label = dayIndex + 1;
    if (dayIndex >= targetDays) {
      cells.push({ label, state: 'future' });
      continue;
    }
    const dateStr = formatDateAtOffset(startDate, dayIndex);
    if (byDate.has(dateStr)) cells.push({ label, state: byDate.get(dateStr)! });
    else if (dateStr === today) cells.push({ label, state: 'today' });
    else if (dateStr > today) cells.push({ label, state: 'future' });
    else cells.push({ label, state: 'reset' });
  }
  return cells;
}

export function ChallengeDayGrid({ targetDays, startDate, log, today }: Props) {
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
      case 'freeze': return C.primarySoft;
      case 'today': return 'transparent';
      case 'future': return 'transparent';
      case 'reset': default: return C.dangerSoft;
    }
  }

  function cellGlyph(state: CellState): string | null {
    switch (state) {
      case 'done': return '✓';
      case 'freeze': return '🧊';
      case 'today': return '🔥';
      case 'reset': return '💔';
      default: return null;
    }
  }

  return (
    <View style={styles.grid}>
      {cells.map(cell => {
        const glyph = cellGlyph(cell.state);
        const onTint = cell.state === 'done';
        return (
          <View
            key={cell.label}
            style={[styles.cell, { backgroundColor: cellColor(cell.state) }, cell.state === 'today' && { borderWidth: 2, borderColor: C.primary }]}
            accessible
            accessibilityLabel={`${cell.label}: ${stateLabel[cell.state]}`}
          >
            {glyph
              ? <Text style={[styles.cellGlyphMain, onTint && { color: C.white }]}>{glyph}</Text>
              : <Text style={styles.cellText}>{cell.label}</Text>}
          </View>
        );
      })}
    </View>
  );
}

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
    cellGlyphMain: { fontSize: 18, lineHeight: 22, color: C.primary },
  });
}
