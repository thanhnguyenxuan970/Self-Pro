import React, { useState, useMemo } from 'react';
import {
  View, Text, Pressable, Modal, TextInput,
  StyleSheet, TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Chip } from '../logic/chipPresets';
import { formatDuration } from '../logic/points';
import { Radii, Spacing, Typography, AppColors } from '../theme';
import { useTheme, useTranslations } from '../hooks/useSettings';

interface Props {
  activityName: string;
  chips: Chip[];
  previewStars: (minutes: number) => number;
  onLog: (minutes: number) => void;
}

export function DurationChips({ activityName, chips, previewStars, onLog }: Props) {
  const { colors } = useTheme();
  const t = useTranslations();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const commit = (minutes: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onLog(minutes);
  };

  const tapChip = (c: Chip) =>
    c.isEscapeHatch ? setPickerOpen(true) : commit(c.minutes);

  const saveCustom = () => {
    const mins = parseInt(customInput, 10);
    if (isNaN(mins) || mins <= 0) return;
    setPickerOpen(false);
    setCustomInput('');
    commit(mins);
  };

  const customMins = parseInt(customInput, 10) || 0;

  return (
    <View style={s.row}>
      <Text style={s.name}>{activityName}</Text>

      <View style={s.chips}>
        {chips.map(c => (
          <Pressable
            key={c.label}
            onPress={() => tapChip(c)}
            style={({ pressed }) => [s.chip, c.isEscapeHatch && s.escape, pressed && s.pressed]}
            accessibilityRole="button"
            accessibilityLabel={
              c.isEscapeHatch
                ? t.chipA11yEscape
                : t.chipA11yLog(c.label, previewStars(c.minutes))
            }
          >
            <Text style={[s.chipText, c.isEscapeHatch && s.escapeText]}>
              {c.label}{c.isEscapeHatch ? ' ›' : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={s.backdrop} onPress={() => setPickerOpen(false)} />
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>{t.durationTitle(activityName)}</Text>
          <TextInput
            style={s.input}
            keyboardType="number-pad"
            value={customInput}
            onChangeText={setCustomInput}
            placeholder={t.durationPlaceholder}
            placeholderTextColor={colors.faint}
            autoFocus
          />
          <TouchableOpacity
            style={[s.save, customMins <= 0 && s.saveDisabled]}
            onPress={saveCustom}
            disabled={customMins <= 0}
            accessibilityRole="button"
          >
            <Text style={s.saveText}>
              {customMins > 0
                ? t.durationSave(formatDuration(customMins), previewStars(customMins))
                : t.durationEnterMins}
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    row:         { paddingVertical: 12, gap: 10 },
    name:        { ...Typography.bodyStrong, color: C.inkDark },
    chips:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip:        {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: Radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.line2,
    },
    escape:      { borderColor: C.primary, backgroundColor: C.primarySoft },
    pressed:     { opacity: 0.55 },
    chipText:    { fontSize: 14, color: C.inkDark },
    escapeText:  { color: C.primary, fontWeight: '600' },
    backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet:       {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: C.surface,
      borderTopLeftRadius: Radii.xxl,
      borderTopRightRadius: Radii.xxl,
      padding: Spacing.xl,
      gap: 14,
      paddingBottom: 36,
    },
    sheetTitle:  { ...Typography.bodyStrong, color: C.inkDark, textAlign: 'center' },
    input:       {
      backgroundColor: C.surface2,
      color: C.inkDark,
      padding: 12,
      borderRadius: Radii.sm,
      fontSize: 18,
      borderWidth: 1,
      borderColor: C.line,
    },
    save:        {
      backgroundColor: C.primary,
      borderRadius: Radii.sm,
      paddingVertical: 14,
      alignItems: 'center',
    },
    saveDisabled: { backgroundColor: C.line2 },
    saveText:    { color: C.white, fontSize: 14, fontWeight: '600' },
  });
}
