// DurationChips.tsx — the default 1-tap logger.
// Renders history-personalized chips + a "2h+" escape hatch that opens a
// wheel picker. One tap commits common durations; long sessions cost one more.
//
// Deps: @react-native-picker/picker (wheel), expo-haptics (optional feedback).

import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';
import type { Chip } from './chipPresets';
import { formatDuration } from './points';

interface Props {
  activityName: string;
  chips: Chip[];                                  // from getChipPresets()
  previewStars: (minutes: number) => number;
  onLog: (minutes: number) => void;               // useDurationLogger().log
}

export function DurationChips({ activityName, chips, previewStars, onLog }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hours, setHours] = useState(2);
  const [mins, setMins] = useState(30);

  const commit = (minutes: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onLog(minutes);
  };

  const tapChip = (c: Chip) =>
    c.isEscapeHatch ? setPickerOpen(true) : commit(c.minutes);

  const savePicker = () => {
    setPickerOpen(false);
    commit(hours * 60 + mins);
  };

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
                ? 'Log a longer duration'
                : `Log ${c.label}, ${previewStars(c.minutes)} stars`
            }
          >
            <Text style={[s.chipText, c.isEscapeHatch && s.escapeText]}>
              {c.label}{c.isEscapeHatch ? ' \u203A' : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setPickerOpen(false)} />
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>{activityName} — how long?</Text>
          <View style={s.wheels}>
            <Picker selectedValue={hours} style={s.wheel} onValueChange={setHours}>
              {Array.from({ length: 13 }, (_, i) => (
                <Picker.Item key={i} label={`${i} h`} value={i} />
              ))}
            </Picker>
            <Picker selectedValue={mins} style={s.wheel} onValueChange={setMins}>
              {[0, 30].map(m => <Picker.Item key={m} label={`${m} m`} value={m} />)}
            </Picker>
          </View>
          <Pressable style={s.save} onPress={savePicker} accessibilityRole="button">
            <Text style={s.saveText}>
              Save · {formatDuration(hours * 60 + mins)} = +{previewStars(hours * 60 + mins)}★
            </Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  row:        { paddingVertical: 12, gap: 10 },
  name:       { fontSize: 15, fontWeight: '500' },
  chips:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:       { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: '#D4D4D4' },
  escape:     { borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.08)' },
  pressed:    { opacity: 0.55 },
  chipText:   { fontSize: 14, color: '#3F3F46' },
  escapeText: { color: '#2563EB', fontWeight: '500' },
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 },
  sheetTitle: { fontSize: 15, fontWeight: '500', textAlign: 'center' },
  wheels:     { flexDirection: 'row', justifyContent: 'center' },
  wheel:      { width: 140 },
  save:       { backgroundColor: '#18181B', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveText:   { color: '#fff', fontSize: 14, fontWeight: '500' },
});
