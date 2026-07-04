import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppColors, FontFamily, Radii, Spacing } from '../config/theme';
import { useTheme } from '../hooks/useSettings';
import { currentDayIndex } from '../lib/challenge';
import type { DayEntryState as ChallengeLogState } from '../lib/challenge';

type CellState = ChallengeLogState | 'today' | 'future';
type Cell = { label: number; state: CellState };

const GRID_CELL_COUNT = 30;

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
  const styles = useMemo(() => makeStyles(C), [C]);
  const cells = useMemo(() => dayCellStates(startDate, targetDays, log, today), [startDate, targetDays, log, today]);

  function cellColor(state: CellState): string {
    switch (state) {
      case 'done': return C.primary;
      case 'freeze': return C.starGold;
      case 'today': return C.primarySoft;
      case 'future': return C.surface2;
      case 'reset': default: return C.dangerSoft;
    }
  }

  return (
    <View style={styles.grid}>
      {cells.map(cell => (
        <View
          key={cell.label}
          style={[styles.cell, { backgroundColor: cellColor(cell.state) }, cell.state === 'today' && { borderWidth: 2, borderColor: C.primary }]}
        >
          <Text style={[styles.cellText, (cell.state === 'done' || cell.state === 'freeze') && { color: C.white }]}>{cell.label}</Text>
        </View>
      ))}
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
      rowGap: 6,
    },
    cell: {
      width: '15.5%',
      aspectRatio: 1,
      borderRadius: Radii.xs,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellText: { fontSize: 11, fontFamily: FontFamily.semiBold, color: C.ink2 },
  });
}
