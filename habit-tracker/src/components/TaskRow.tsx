import React, { useRef, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Pressable, Platform, StyleSheet, Animated } from 'react-native';
import { AppColors, FontFamily } from '../config/theme';
import { useTranslations } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { resolveTaskDisplayName } from '../utils/resolveTaskDisplayName';

export type Task = {
  id: number; name: string; kind: string; is_time_based: number;
  base_points: number; star_penalty: number; icon: string | null;
  category_id: number | null; sort_order: number; is_template: number;
};

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function useTaskRowAnimation(justLogged: boolean, done: boolean) {
  const reduceMotion = useReduceMotion();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const checkScaleAnim = useRef(new Animated.Value(1)).current;
  const prevLogged = useRef(false);
  const prevDone = useRef<boolean | null>(null);

  useEffect(() => {
    if (justLogged && !prevLogged.current) {
      if (reduceMotion) {
        fadeAnim.setValue(1);
        prevLogged.current = justLogged;
        return;
      }
      const anim = Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true });
      anim.start(({ finished }) => {
        if (finished) {
          fadeAnim.setValue(1);
        }
      });
      prevLogged.current = justLogged;
      return () => {
        anim.stop();
        fadeAnim.setValue(1);
      };
    }
    prevLogged.current = justLogged;
  }, [justLogged, reduceMotion]);

  useEffect(() => {
    if (prevDone.current === null) {
      prevDone.current = done;
      return;
    }
    if (done && !prevDone.current && !reduceMotion) {
      checkScaleAnim.setValue(0.1);
      Animated.spring(checkScaleAnim, { toValue: 1, tension: 220, friction: 6, useNativeDriver: true }).start();
    } else if (!done && prevDone.current) {
      checkScaleAnim.setValue(1);
    }
    prevDone.current = done;
  }, [done, reduceMotion]);

  return { fadeAnim, checkScaleAnim };
}

type Styles = ReturnType<typeof makeTaskRowStyles>;

function resolveCheckStyle(styles: Styles, selectionMode: boolean, isSelected: boolean, done: boolean, isBad: boolean) {
  if (selectionMode) return isSelected ? styles.checkDone : undefined;
  if (!done) return undefined;
  return isBad ? styles.checkBad : styles.checkDone;
}

function resolveCheckMark(selectionMode: boolean, isSelected: boolean, done: boolean, isBad: boolean): string {
  if (selectionMode) return isSelected ? '✓' : '';
  if (!done) return '';
  return isBad ? '✕' : '✓';
}

function resolvePtsStyle(styles: Styles, done: boolean, isBad: boolean) {
  if (!done) return styles.tPtsIdle;
  return isBad ? styles.tPtsNeg : styles.tPtsPos;
}

type MetaProps = {
  item: Task; done: boolean;
  totalDurationMin: number | undefined;
  styles: Styles;
};

// fallow-ignore-next-line complexity
function TaskMetaRow({ item, done, totalDurationMin, styles }: MetaProps) {
  const showDuration = done && !!item.is_time_based && (totalDurationMin ?? 0) > 0;
  if (!showDuration) return null;
  return (
    <View style={styles.tMeta}>
      <Text style={[styles.tMetaText, styles.tMetaDuration]}>{fmtDuration(totalDurationMin!)}</Text>
    </View>
  );
}

type Props = {
  item: Task; done: boolean; isBad: boolean; isLast: boolean;
  isSelected: boolean; selectionMode: boolean; justLogged: boolean;
  totalDurationMin?: number; starsEarned?: number; pointsEarned?: number; logPending: boolean;
  boostMultiplier?: number;
  boostedMultiplier?: number;
  colors: AppColors;
  onPress: (item: Task) => void; onLongPress: (item: Task) => void; onEdit?: (item: Task) => void;
};

function TaskRowComponent({ item, done, isBad, isLast, isSelected, selectionMode, justLogged, totalDurationMin, starsEarned, pointsEarned, boostMultiplier = 1, boostedMultiplier = 1, onPress, onLongPress, onEdit, logPending, colors }: Props) {
  const t = useTranslations();
  const styles = useMemo(() => makeTaskRowStyles(colors), [colors]);
  const { fadeAnim, checkScaleAnim } = useTaskRowAnimation(justLogged, done);
  const rowMultiplier = done ? boostedMultiplier : boostMultiplier;
  const isBoostPreview = !isBad && boostMultiplier > 1;

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      {/* The edit button must sit outside the checkbox Pressable's subtree: an
          accessible/role-bearing parent collapses all descendants into one
          TalkBack/VoiceOver node, which made the nested edit TouchableOpacity
          completely unreachable by screen reader (touch-only users never
          noticed since the inner touchable still claims the raw tap first). */}
      <View style={[styles.task, isLast && styles.taskLast, done && !isBad && styles.taskDone, isSelected && styles.taskSelected]}>
        <Pressable
          style={({ pressed }) => [styles.taskPress, Platform.OS === 'ios' && pressed && styles.taskPressedIOS]}
          android_ripple={{ color: colors.line2 }}
          onPress={() => onPress(item)}
          onLongPress={() => onLongPress(item)}
          delayLongPress={300}
          disabled={!selectionMode && logPending}
          accessibilityLabel={resolveTaskDisplayName(item.name, t, item.is_template === 1)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selectionMode ? isSelected : done, selected: selectionMode ? isSelected : undefined }}
        >
          <Animated.View style={[styles.check, resolveCheckStyle(styles, selectionMode, isSelected, done, isBad), { transform: [{ scale: checkScaleAnim }] }]}>
            <Text style={styles.checkMark}>{resolveCheckMark(selectionMode, isSelected, done, isBad)}</Text>
          </Animated.View>
          <View style={styles.tBody}>
            <View style={styles.titleRow}>
              <Text style={[styles.tName, done && styles.tNameDone]} numberOfLines={1}>{resolveTaskDisplayName(item.name, t, item.is_template === 1)}</Text>
              {item.icon ? <Text style={styles.titleIcon}>{item.icon}</Text> : null}
            </View>
            <TaskMetaRow item={item} done={done} totalDurationMin={totalDurationMin}
              styles={styles} />
          </View>
        </Pressable>
        {(done || (!selectionMode && (onEdit || isBoostPreview))) ? <View style={styles.rightCol}>
          {!selectionMode && onEdit ? (
            <TouchableOpacity
              onPress={() => onEdit(item)}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              accessibilityLabel={t.editActivity}
              accessibilityRole="button"
            >
              <Text style={styles.editIcon}>•••</Text>
            </TouchableOpacity>
          ) : null}
          {done || isBoostPreview ? <Text style={[styles.tPts, resolvePtsStyle(styles, done, isBad), !done && isBoostPreview && styles.tPtsPos]}>
            {isBad
              ? `−${item.star_penalty}★`
              : `+${done ? Math.round(starsEarned ?? 1) : Math.round(boostMultiplier)}★${rowMultiplier > 1 ? ` · ×${Math.round(rowMultiplier)}` : ''}${done ? ` · +${t.ptsShort(pointsEarned ?? item.base_points)}` : ''}`}
          </Text> : null}
        </View> : null}
      </View>
    </Animated.View>
  );
}

export const TaskRow = React.memo(TaskRowComponent);

function makeTaskRowStyles(C: AppColors) {
  return StyleSheet.create({
    task: {
      flexDirection: 'row', alignItems: 'center', gap: 13,
      paddingVertical: 14, borderBottomWidth: 1, borderColor: C.line,
    },
    taskPress: {
      flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 13,
    },
    taskLast: { borderBottomWidth: 0 },
    taskPressedIOS: { opacity: 0.7 },
    taskDone: { backgroundColor: C.primarySoft, marginHorizontal: -15, paddingHorizontal: 15 },
    taskSelected: { backgroundColor: C.primarySoft, marginHorizontal: -15, paddingHorizontal: 15 },
    check: {
      width: 26, height: 26, borderRadius: 13,
      borderWidth: 2, borderColor: C.line2,
      backgroundColor: C.surface,
      justifyContent: 'center', alignItems: 'center',
      flexShrink: 0,
    },
    checkDone: { backgroundColor: C.primary, borderColor: C.primary },
    // dangerPress (not danger) so the white checkmark glyph clears 4.5:1 in
    // both themes — plain `danger` computes borderline/failing against white.
    checkBad: { backgroundColor: C.dangerPress, borderColor: C.dangerPress },
    checkMark: { fontSize: 13, fontFamily: FontFamily.extraBold, color: C.onAccent },
    tBody: { flex: 1, minWidth: 0 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    tName: { flexShrink: 1, fontSize: 14.5, lineHeight: 20, fontFamily: FontFamily.semiBold, color: C.inkDark },
    tNameDone: { color: C.ink2, textDecorationLine: 'line-through' },
    titleIcon: { fontSize: 13, lineHeight: 20 },
    tMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    tMetaText: { fontSize: 11.5, lineHeight: 17, color: C.muted },
    tMetaDuration: { color: C.primaryText, fontFamily: FontFamily.bold },
    rightCol: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
    editIcon: { fontSize: 20, color: C.muted },
    tPts: { fontSize: 13, fontFamily: FontFamily.extraBold, flexShrink: 0 },
    tPtsPos: { color: C.primaryText },
    tPtsNeg: { color: C.dangerText },
    tPtsIdle: { color: C.faint },
  });
}
