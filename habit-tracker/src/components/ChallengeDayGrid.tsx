import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppColors, FontFamily, Radii, Spacing } from '../config/theme';
import { useTheme } from '../hooks/useSettings';
import type { DayEntryState as ChallengeLogState } from '../lib/challenge';

type CellState = ChallengeLogState | 'today' | 'future';

type Props = {
  targetDays: number;
  startDate: string;
  log: { date: string; state: ChallengeLogState }[];
  today: string;
};

function dayCellStates(startDate: string, targetDays: number, log: { date: string; state: ChallengeLogState }[], today: string): CellState[] {
  const byDate = new Map(log.map(l => [l.date, l.state]));
  const cur = new Date(startDate + 'T12:00:00');
  const cells: CellState[] = [];
  for (let i = 0; i < targetDays; i++) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    if (byDate.has(dateStr)) cells.push(byDate.get(dateStr)!);
    else if (dateStr === today) cells.push('today');
    else if (dateStr > today) cells.push('future');
    else cells.push('reset');
    cur.setDate(cur.getDate() + 1);
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
      {cells.map((state, i) => (
        <View
          key={i}
          style={[styles.cell, { backgroundColor: cellColor(state) }, state === 'today' && { borderWidth: 2, borderColor: C.primary }]}
        >
          <Text style={[styles.cellText, (state === 'done' || state === 'freeze') && { color: C.white }]}>{i + 1}</Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    cell: {
      width: 32,
      height: 32,
      borderRadius: Radii.xs,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellText: { fontSize: 11, fontFamily: FontFamily.semiBold, color: C.ink2 },
  });
}
