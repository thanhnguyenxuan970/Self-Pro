import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useTodayTasks } from '../queries/useToday';
import { useBackfillDay } from '../queries/useBackfill';
import { backfillRemaining } from '../game/backfill';
import { AppColors, FontFamily, Radii, Spacing } from '../config/theme';

const DURATION_OPTIONS: { label: string; mins: number }[] = [
  { label: '30', mins: 30 },
  { label: '1h', mins: 60 },
  { label: '1.5h', mins: 90 },
];

interface Props {
  visible: boolean;
  date: string; // YYYY-MM-DD
  backfillsUsedThisWeek: number;
  userId: number;
  onClose: () => void;
}

export function BackfillSheet({ visible, date, backfillsUsedThisWeek, userId, onClose }: Props) {
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = makeStyles(colors);

  const { data: tasks = [] } = useTodayTasks(userId);
  const { mutateAsync, isPending } = useBackfillDay(userId);

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState<number>(30);

  useEffect(() => {
    if (visible) {
      setSelectedTaskId(null);
      setDurationMin(30);
    }
  }, [visible]);

  const remaining = backfillRemaining(backfillsUsedThisWeek);
  const quotaExceeded = remaining <= 0;
  const selectedTask = tasks.find(tk => tk.id === selectedTaskId);
  const needsDuration = selectedTask?.is_time_based === 1;

  function formatDate(d: string): string {
    const [y, m, day] = d.split('-').map(Number);
    const dt = new Date(y, m - 1, day);
    const dow = t.dayNames[dt.getDay()];
    return `${dow}, ${day}/${m}`;
  }

  async function handleConfirm() {
    if (!selectedTask) return;
    try {
      await mutateAsync({
        date,
        taskTypeId: selectedTask.id,
        kind: selectedTask.kind as 'GOOD' | 'BAD',
        isTimeBased: !!selectedTask.is_time_based,
        basePoints: selectedTask.base_points,
        starPenalty: selectedTask.star_penalty,
        durationMin: needsDuration ? durationMin : undefined,
      });
      Toast.show({ type: 'success', text1: t.backfillSuccess });
      onClose();
    } catch (err: unknown) {
      const msg = (err as Error)?.message;
      const reason =
        msg === 'QUOTA_EXCEEDED' ? t.backfillDenyQuota :
        msg === 'DAY_NOT_EMPTY'  ? t.backfillDenyFull :
        msg === 'HAS_FREEZE'     ? t.backfillDenyFreeze :
        t.cantLog;
      Alert.alert(t.error, reason);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grip} />

          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>{t.backfillTitle}</Text>
              <Text style={styles.dateLabel}>{formatDate(date)}</Text>
            </View>
            <View style={[styles.quotaBadge, quotaExceeded && { backgroundColor: colors.dangerSoft }]}>
              <Text style={[styles.quotaText, quotaExceeded && { color: colors.danger }]}>
                {t.backfillQuota(remaining)}
              </Text>
            </View>
          </View>

          {quotaExceeded ? (
            <View style={styles.quotaExhausted}>
              <Text style={styles.quotaExhaustedText}>{t.backfillDenyQuota}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>{t.backfillPickTask}</Text>
              {tasks.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>{t.backfillNoTasks}</Text>
                </View>
              ) : null}
              <ScrollView
                style={styles.taskList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {tasks.map(task => {
                  const on = selectedTaskId === task.id;
                  return (
                    <TouchableOpacity
                      key={task.id}
                      style={[styles.taskRow, on && { backgroundColor: colors.primarySoft }]}
                      onPress={() => setSelectedTaskId(on ? null : task.id)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={styles.taskIcon}>{task.icon ?? '⭐'}</Text>
                      <Text
                        style={[styles.taskName, on && { color: colors.primary, fontFamily: FontFamily.semiBold }]}
                        numberOfLines={1}
                      >
                        {task.name}
                      </Text>
                      {on && <Text style={[styles.checkMark, { color: colors.primary }]}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {needsDuration && (
                <View style={styles.durationRow}>
                  {DURATION_OPTIONS.map(opt => {
                    const on = durationMin === opt.mins;
                    return (
                      <TouchableOpacity
                        key={opt.mins}
                        style={[styles.durChip, on && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                        onPress={() => setDurationMin(opt.mins)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.durChipText, on && { color: colors.primary, fontFamily: FontFamily.semiBold }]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <TouchableOpacity
                style={[styles.cta, (!selectedTask || isPending) && styles.ctaDisabled]}
                onPress={handleConfirm}
                disabled={!selectedTask || isPending}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t.backfillConfirm}
              >
                {isPending
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.ctaText}>{t.backfillConfirm}</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radii.xl,
      borderTopRightRadius: Radii.xl,
      paddingHorizontal: Spacing.lg,
      paddingBottom: 36,
      paddingTop: 12,
      maxHeight: '80%',
    },
    grip: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line,
      alignSelf: 'center',
      marginBottom: 16,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    title: {
      fontSize: 18,
      fontFamily: FontFamily.bold,
      color: colors.inkDark,
    },
    dateLabel: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      color: colors.ink2,
      marginTop: 2,
    },
    quotaBadge: {
      backgroundColor: colors.primarySoft,
      borderRadius: Radii.sm,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    quotaText: {
      fontSize: 12,
      fontFamily: FontFamily.semiBold,
      color: colors.primary,
    },
    quotaExhausted: {
      paddingVertical: 32,
      alignItems: 'center',
    },
    quotaExhaustedText: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
      color: colors.ink2,
      textAlign: 'center',
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: FontFamily.semiBold,
      color: colors.ink2,
      marginBottom: 8,
    },
    emptyState: {
      paddingVertical: 20,
      alignItems: 'center',
    },
    emptyStateText: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      color: colors.ink2,
      textAlign: 'center',
    },
    taskList: {
      maxHeight: 280,
    },
    taskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius: Radii.sm,
      marginBottom: 4,
    },
    taskIcon: {
      fontSize: 20,
      marginRight: 10,
      width: 28,
      textAlign: 'center',
    },
    taskName: {
      flex: 1,
      fontSize: 15,
      fontFamily: FontFamily.regular,
      color: colors.inkDark,
    },
    checkMark: {
      fontSize: 16,
      fontFamily: FontFamily.bold,
      marginLeft: 8,
    },
    durationRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
      marginBottom: 4,
    },
    durChip: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: Radii.sm,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
    },
    durChipText: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      color: colors.ink2,
    },
    cta: {
      marginTop: 16,
      backgroundColor: colors.primary,
      borderRadius: Radii.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    ctaDisabled: {
      opacity: 0.4,
    },
    ctaText: {
      fontSize: 15,
      fontFamily: FontFamily.bold,
      color: '#fff',
    },
  });
}
