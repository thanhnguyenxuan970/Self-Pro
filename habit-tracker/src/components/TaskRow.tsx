import React, { useRef, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { AppColors } from '../config/theme';
import { useTranslations } from '../hooks/useSettings';

export type Task = {
  id: number; name: string; kind: string; is_time_based: number;
  base_points: number; star_penalty: number; icon: string | null;
  category_id: number | null; sort_order: number;
};

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

type Props = {
  item: Task; done: boolean; isBad: boolean; isLast: boolean;
  isSelected: boolean; selectionMode: boolean; justLogged: boolean;
  totalDurationMin?: number; logPending: boolean;
  colors: AppColors;
  onPress: () => void; onLongPress: () => void;
};

export function TaskRow({ item, done, isBad, isLast, isSelected, selectionMode, justLogged, totalDurationMin, onPress, onLongPress, logPending, colors }: Props) {
  const t = useTranslations();
  const styles = useMemo(() => makeTaskRowStyles(colors), [colors]);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const prevLogged = useRef(false);

  useEffect(() => {
    if (justLogged && !prevLogged.current) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 0.85, tension: 200, friction: 10, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 40, tension: 200, friction: 10, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) {
          fadeAnim.setValue(1);
          scaleAnim.setValue(1);
          slideAnim.setValue(0);
        }
      });
    }
    prevLogged.current = justLogged;
  }, [justLogged]);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }, { translateX: slideAnim }] }}>
      <TouchableOpacity
        style={[styles.task, isLast && styles.taskLast, isSelected && styles.taskSelected]}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={300}
        disabled={!selectionMode && logPending}
        activeOpacity={0.7}
      >
        <View style={[styles.check, selectionMode ? (isSelected && styles.checkDone) : (done && (isBad ? styles.checkBad : styles.checkDone))]}>
          <Text style={styles.checkMark}>
            {selectionMode ? (isSelected ? '✓' : '') : (done ? (isBad ? '✕' : '✓') : '')}
          </Text>
        </View>
        <View style={styles.tBody}>
          <Text style={[styles.tName, done && styles.tNameDone]}>{item.name}</Text>
          <View style={styles.tMeta}>
            {item.icon ? <Text style={styles.tMetaText}>{item.icon}</Text> : null}
            {item.icon && item.is_time_based ? <View style={styles.dot} /> : null}
            {item.is_time_based ? <Text style={styles.tMetaText}>{t.timedMeta}</Text> : null}
            {(item.icon || item.is_time_based) ? <View style={styles.dot} /> : null}
            <Text style={styles.tMetaText}>
              {isBad ? t.badHabitMeta : `${item.is_time_based ? '1pt/30m' : t.ptsLabel(item.base_points)}`}
            </Text>
            {done && item.is_time_based && (totalDurationMin ?? 0) > 0 ? (
              <><View style={styles.dot} /><Text style={[styles.tMetaText, styles.tMetaDuration]}>{fmtDuration(totalDurationMin!)}</Text></>
            ) : null}
          </View>
        </View>
        <Text style={[styles.tPts, done ? (isBad ? styles.tPtsNeg : styles.tPtsPos) : styles.tPtsIdle]}>
          {isBad ? `−${item.star_penalty} ★` : '+1 ★'}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function makeTaskRowStyles(C: AppColors) {
  return StyleSheet.create({
    task: {
      flexDirection: 'row', alignItems: 'center', gap: 13,
      paddingVertical: 14, borderBottomWidth: 1, borderColor: C.line,
    },
    taskLast: { borderBottomWidth: 0 },
    taskSelected: { backgroundColor: C.primarySoft, marginHorizontal: -15, paddingHorizontal: 15 },
    check: {
      width: 26, height: 26, borderRadius: 13,
      borderWidth: 2, borderColor: C.line2,
      backgroundColor: C.surface,
      justifyContent: 'center', alignItems: 'center',
      flexShrink: 0,
    },
    checkDone: { backgroundColor: C.primary, borderColor: C.primary },
    checkBad: { backgroundColor: C.danger, borderColor: C.danger },
    checkMark: { fontSize: 13, fontWeight: '800', color: '#fff' },
    tBody: { flex: 1, minWidth: 0 },
    tName: { fontSize: 14.5, fontWeight: '600', color: C.inkDark },
    tNameDone: { color: C.muted, textDecorationLine: 'line-through' },
    tMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    tMetaText: { fontSize: 11.5, color: C.muted },
    tMetaDuration: { color: C.primary, fontWeight: '700' },
    dot: { width: 3, height: 3, backgroundColor: C.faint, borderRadius: 2 },
    tPts: { fontSize: 13, fontWeight: '800', flexShrink: 0 },
    tPtsPos: { color: C.primary },
    tPtsNeg: { color: C.danger },
    tPtsIdle: { color: C.faint },
  });
}
