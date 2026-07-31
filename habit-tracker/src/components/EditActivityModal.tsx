import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { AppColors, FontFamily, Radii, Spacing, Typography } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import type { Task } from './TaskRow';
import { DurationClockInput } from './DurationClockInput';
import { clockFromMinutes, clockMinutes } from '../utils/durationClock';

type Props = {
  visible: boolean;
  task: Task | null;
  totalDurationMin?: number;
  onSave: (taskId: number, name: string, isTimeBased: boolean, newDurationMin: number | null) => void;
  onClose: () => void;
};

export function EditActivityModal({ visible, task, totalDurationMin, onSave, onClose }: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [duration, setDuration] = useState({ hours: 0, minutes: 0 });
  const [isTimeBased, setIsTimeBased] = useState(false);

  React.useEffect(() => {
    if (task) {
      setName(task.name);
      setDuration(clockFromMinutes(totalDurationMin ?? 0));
      setIsTimeBased(!!task.is_time_based);
    }
  }, [task, totalDurationMin]);

  if (!task) return null;

  function handleSave() {
    if (!task) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const newDuration = isTimeBased && clockMinutes(duration) > 0 ? clockMinutes(duration) : null;
    onSave(task.id, trimmed, isTimeBased, newDuration);
  }

  function selectType(nextIsTimeBased: boolean) {
    if (nextIsTimeBased || !isTimeBased) {
      setIsTimeBased(nextIsTimeBased);
      return;
    }
    Alert.alert(t.editTimerConfirmTitle, t.editTimerConfirmBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.editTimerConfirmAction, style: 'destructive', onPress: () => setIsTimeBased(false) },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.box}>
          <Text style={styles.title}>{t.editActivityTitle}</Text>

          <Text style={styles.label}>{t.editNameLabel}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={50}
            autoFocus
            returnKeyType={isTimeBased ? 'next' : 'done'}
            onSubmitEditing={isTimeBased ? undefined : handleSave}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t.editNameLabel}
          />

          <Text style={styles.label}>{t.editActivityTypeLabel}</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity style={[styles.typeBtn, isTimeBased && styles.typeBtnSelected, isTimeBased && { backgroundColor: colors.primary }]} onPress={() => selectType(true)} accessibilityRole="button" accessibilityState={{ selected: isTimeBased }}>
              <Text style={[styles.typeText, isTimeBased && { color: colors.onAccent }]}>{t.editTimed}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.typeBtn, !isTimeBased && styles.typeBtnSelected, !isTimeBased && { backgroundColor: colors.primary }]} onPress={() => selectType(false)} accessibilityRole="button" accessibilityState={{ selected: !isTimeBased }}>
              <Text style={[styles.typeText, !isTimeBased && { color: colors.onAccent }]}>{t.editNoTimer}</Text>
            </TouchableOpacity>
          </View>

          {isTimeBased && (
            <>
              <Text style={styles.label}>{t.editDurationLabel}</Text>
              <DurationClockInput value={duration} onChange={setDuration} colors={colors} />
            </>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onClose} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={t.cancel}>
              <Text style={[styles.btnText, { color: colors.muted }]}>{t.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.editSave}>
              <Text style={[styles.btnText, { color: colors.onAccent }]}>{t.editSave}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: C.scrim,
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
    },
    box: {
      backgroundColor: C.surface,
      borderRadius: Radii.xl,
      padding: Spacing.lg,
      alignSelf: 'center', width: '100%', maxWidth: 480,
    },
    title: { ...Typography.subheading, color: C.inkDark, marginBottom: Spacing.md },
    label: { ...Typography.caption, color: C.ink2, marginBottom: 4, marginTop: Spacing.sm },
    input: {
      backgroundColor: C.surface2,
      borderRadius: Radii.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: FontFamily.regular,
      color: C.inkDark,
      borderWidth: 1,
      borderColor: C.line,
    },
    typeRow: { flexDirection: 'row', gap: Spacing.sm },
    typeBtn: { flex: 1, minHeight: 44, borderRadius: Radii.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
    typeBtnSelected: { borderColor: C.primary },
    typeText: { ...Typography.caption, color: C.ink2, fontFamily: FontFamily.semiBold },
    btnRow: { flexDirection: 'row', gap: 10, marginTop: Spacing.lg },
    btn: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: Radii.md,
      alignItems: 'center',
    },
    cancelBtn: { backgroundColor: C.surface2 },
    saveBtn: {},
    btnText: { fontFamily: FontFamily.semiBold, fontSize: 15 },
  });
}
