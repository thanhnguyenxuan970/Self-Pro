// 1-tap duration logger. History-personalized chips + "2h+" escape hatch
// that opens a text input sheet. Tap common durations instantly; long sessions
// cost one extra tap.

import React, { useState } from 'react';
import {
  View, Text, Pressable, Modal, TextInput,
  StyleSheet, TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Chip } from '../logic/chipPresets';
import { formatDuration } from '../logic/points';
import { Colors, Radii, Spacing, Typography } from '../theme';

interface Props {
  activityName: string;
  chips: Chip[];                           // from getChipPresets()
  previewStars: (minutes: number) => number;
  onLog: (minutes: number) => void;
}

export function DurationChips({ activityName, chips, previewStars, onLog }: Props) {
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
                ? 'Nhập thời lượng dài hơn'
                : `Ghi ${c.label}, ${previewStars(c.minutes)} sao`
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
          <Text style={s.sheetTitle}>{activityName} — bao nhiêu phút?</Text>
          <TextInput
            style={s.input}
            keyboardType="number-pad"
            value={customInput}
            onChangeText={setCustomInput}
            placeholder="Ví dụ: 150"
            placeholderTextColor={Colors.faint}
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
                ? `Lưu · ${formatDuration(customMins)} = +${previewStars(customMins)}★`
                : 'Nhập số phút'}
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  row:         { paddingVertical: 12, gap: 10 },
  name:        { ...Typography.bodyStrong, color: Colors.inkDark },
  chips:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.line2,
  },
  escape:      { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  pressed:     { opacity: 0.55 },
  chipText:    { fontSize: 14, color: Colors.inkDark },
  escapeText:  { color: Colors.primary, fontWeight: '600' },
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet:       {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radii.xxl,
    borderTopRightRadius: Radii.xxl,
    padding: Spacing.xl,
    gap: 14,
    paddingBottom: 36,
  },
  sheetTitle:  { ...Typography.bodyStrong, color: Colors.inkDark, textAlign: 'center' },
  input:       {
    backgroundColor: Colors.surface2,
    color: Colors.inkDark,
    padding: 12,
    borderRadius: Radii.sm,
    fontSize: 18,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  save:        {
    backgroundColor: Colors.primary,
    borderRadius: Radii.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveDisabled: { backgroundColor: Colors.line2 },
  saveText:    { color: Colors.white, fontSize: 14, fontWeight: '600' },
});
