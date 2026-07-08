import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppColors, FontFamily, Radii } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';

type CellState = 'done' | 'rest' | 'today' | 'future';

type Props = {
  weekStart: string; // Monday of the current week window (YYYY-MM-DD)
  doneDates: ReadonlySet<string>;
  today: string;
};

const WEEKDAY_LABELS_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function WeekStrip({ weekStart, doneDates, today }: Props) {
  const { colors: C } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(C), [C]);

  const cells = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      let state: CellState;
      if (doneDates.has(date)) state = 'done';
      else if (date === today) state = 'today';
      else if (date > today) state = 'future';
      else state = 'rest';
      return { date, state, dayNumber: Number(date.slice(8, 10)) };
    });
  }, [weekStart, doneDates, today]);

  function cellColor(state: CellState): string {
    switch (state) {
      case 'done': return C.primarySoft;
      case 'today': return C.surface;
      case 'rest': return C.surface2;
      default: return C.surface2;
    }
  }

  function cellGlyph(state: CellState): string | null {
    switch (state) {
      case 'done': return '✓';
      case 'rest': return '🌴';
      case 'today': return '🔥';
      default: return null;
    }
  }

  function stateLabel(state: CellState): string {
    switch (state) {
      case 'done': return t.weekStripDone;
      case 'rest': return t.weekStripRest;
      case 'today': return t.weekStripToday;
      default: return t.weekStripFuture;
    }
  }

  return (
    <View style={styles.row}>
      {cells.map((cell, i) => (
        <View key={cell.date} style={styles.col}>
          <Text style={styles.weekdayLabel}>{WEEKDAY_LABELS_VI[i]}</Text>
          <View
            style={[
              styles.cell,
              { backgroundColor: cellColor(cell.state) },
              cell.state === 'today' && { borderWidth: 2, borderColor: C.primary },
            ]}
            accessible
            accessibilityLabel={`${WEEKDAY_LABELS_VI[i]}, ${stateLabel(cell.state)}`}
          >
            {cellGlyph(cell.state)
              ? <Text style={[styles.glyph, cell.state === 'done' && { color: C.primary }]}>{cellGlyph(cell.state)}</Text>
              : <Text style={styles.dayNumber}>{cell.dayNumber}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch' },
    col: { alignItems: 'center', gap: 6 },
    weekdayLabel: { fontSize: 11, fontFamily: FontFamily.semiBold, color: C.ink2 },
    cell: {
      width: 38, height: 38, borderRadius: Radii.md,
      alignItems: 'center', justifyContent: 'center',
    },
    glyph: { fontSize: 15, color: C.ink2 },
    dayNumber: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.ink2 },
  });
}
