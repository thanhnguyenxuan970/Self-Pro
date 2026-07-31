import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { AppColors, FontFamily, Radii, Spacing } from '../config/theme';
import { useTranslations } from '../hooks/useSettings';

const PRESETS = [{ label: '30m', mins: 30 }, { label: '45m', mins: 45 }, { label: '1h', mins: 60 }] as const;

interface DurationPresetChipsProps {
  colors: AppColors;
  disabled?: boolean;
  onSelectPreset: (mins: number) => void;
  onCustom: () => void;
  customLabel: string;
  rowStyle?: ViewStyle;
}

/** The "30m / 45m / 1h / custom" duration chip row shared by the add-activity
 *  sheet and the today-screen duration modal. */
export function DurationPresetChips({ colors, disabled, onSelectPreset, onCustom, customLabel, rowStyle }: DurationPresetChipsProps) {
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.presetChipsRow, rowStyle]}>
      {PRESETS.map(p => (
        <TouchableOpacity
          key={p.label}
          style={styles.presetChip}
          onPress={() => onSelectPreset(p.mins)}
          disabled={disabled}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t.presetMinutesA11y(p.mins)}
        >
          <Text style={styles.presetChipText}>{p.label}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        style={[styles.presetChip, styles.presetChipCustom]}
        onPress={onCustom}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={customLabel}
      >
        <Text style={[styles.presetChipText, styles.presetChipCustomText]}>{customLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    presetChipsRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.md, flexWrap: 'wrap' },
    presetChip: {
      flex: 1, minWidth: 60, backgroundColor: C.primary,
      borderRadius: Radii.md, paddingVertical: 16,
      alignItems: 'center', justifyContent: 'center',
    },
    presetChipCustom: { backgroundColor: C.surface2, borderWidth: 1.5, borderColor: C.line2 },
    presetChipText: { color: C.onAccent, fontSize: 16, fontFamily: FontFamily.extraBold },
    presetChipCustomText: { color: C.inkDark },
  });
}
