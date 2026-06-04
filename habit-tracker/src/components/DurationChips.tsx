import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, Pressable, Modal, TextInput,
  StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { cueChipConfirm } from '../audio/uiSounds';
import type { Chip } from '../game/chipPresets';
import { formatDuration } from '../game/points';
import { Radii, Spacing, Typography, AppColors } from '../theme';
import { useTheme, useTranslations } from '../hooks/useSettings';

interface Props {
  activityName: string;
  chips: Chip[];
  previewStars: (minutes: number) => number;
  onLog: (minutes: number) => void;
}

function ChipButton({ chip, onPress, chipStyle, textStyle, a11yLabel }: {
  chip: Chip; onPress: () => void;
  chipStyle: any; textStyle: any; a11yLabel: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.92, tension: 140, friction: 7, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, tension: 140, friction: 7, useNativeDriver: true }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={chipStyle} accessibilityRole="button" accessibilityLabel={a11yLabel}>
        <Text style={textStyle}>{chip.label}{chip.isEscapeHatch ? ' ›' : ''}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function DurationChips({ activityName, chips, previewStars, onLog }: Props) {
  const { colors } = useTheme();
  const t = useTranslations();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const glowOpacity = useRef(new Animated.Value(0.4)).current;

  const commit = (minutes: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    cueChipConfirm();
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
  const inputValid = customMins > 0;

  useEffect(() => {
    if (inputValid && pickerOpen) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowOpacity, { toValue: 1, duration: 600, useNativeDriver: false }),
          Animated.timing(glowOpacity, { toValue: 0.4, duration: 600, useNativeDriver: false }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      glowOpacity.setValue(0.4);
    }
  }, [inputValid, pickerOpen]);

  return (
    <View style={s.row}>
      <Text style={s.name}>{activityName}</Text>

      <View style={s.chips}>
        {chips.map(c => (
          <ChipButton
            key={c.label}
            chip={c}
            onPress={() => tapChip(c)}
            chipStyle={[s.chip, c.isEscapeHatch && s.escape]}
            textStyle={[s.chipText, c.isEscapeHatch && s.escapeText]}
            a11yLabel={c.isEscapeHatch ? t.chipA11yEscape : t.chipA11yLog(c.label, previewStars(c.minutes))}
          />
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
            {inputValid && (
              <Animated.View style={[StyleSheet.absoluteFill, s.saveGlow, { opacity: glowOpacity }]} />
            )}
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
      overflow: 'hidden',
    },
    saveGlow:    { backgroundColor: 'rgba(255,255,255,0.25)' },
    saveDisabled: { backgroundColor: C.line2 },
    saveText:    { color: C.white, fontSize: 14, fontWeight: '600' },
  });
}
