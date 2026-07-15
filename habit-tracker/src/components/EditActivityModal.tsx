import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { AppColors, FontFamily, Radii, Spacing, Typography } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import type { Task } from './TaskRow';

type Props = {
  visible: boolean;
  task: Task | null;
  totalDurationMin?: number;
  onSave: (taskId: number, name: string, newDurationMin: number | null) => void;
  onClose: () => void;
};

export function EditActivityModal({ visible, task, totalDurationMin, onSave, onClose }: Props) {
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [duration, setDuration] = useState('');

  React.useEffect(() => {
    if (task) {
      setName(task.name);
      setDuration(totalDurationMin != null ? String(totalDurationMin) : '');
    }
  }, [task, totalDurationMin]);

  if (!task) return null;

  function handleSave() {
    if (!task) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const parsed = parseInt(duration, 10);
    const newDuration = task.is_time_based && !isNaN(parsed) && parsed > 0 ? parsed : null;
    onSave(task.id, trimmed, newDuration);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
            returnKeyType={task.is_time_based ? 'next' : 'done'}
            onSubmitEditing={task.is_time_based ? undefined : handleSave}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t.editNameLabel}
          />

          {!!task.is_time_based && (
            <>
              <Text style={styles.label}>{t.editDurationLabel}</Text>
              <TextInput
                style={styles.input}
                value={duration}
                onChangeText={setDuration}
                keyboardType="number-pad"
                maxLength={5}
                returnKeyType="done"
                onSubmitEditing={handleSave}
                placeholderTextColor={colors.muted}
                accessibilityLabel={t.editDurationLabel}
                accessibilityHint="Nhập số phút"
              />
            </>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onClose} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={t.cancel}>
              <Text style={[styles.btnText, { color: colors.muted }]}>{t.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.editSave}>
              <Text style={[styles.btnText, { color: colors.white }]}>{t.editSave}</Text>
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
