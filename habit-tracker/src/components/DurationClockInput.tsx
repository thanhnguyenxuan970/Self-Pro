import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AppColors, FontFamily, Radii } from '../config/theme';
import { clampClockValue, type DurationClock, wheelValueAtOffset } from '../utils/durationClock';

const ROW_HEIGHT = 40;

type Props = {
  value: DurationClock;
  onChange: (value: DurationClock) => void;
  colors: AppColors;
  hoursLabel?: string;
  minutesLabel?: string;
  editValueLabel?: (label: string) => string;
};

function Wheel({ label, value, max, onChange, colors, styles, editValueLabel }: { label: string; value: number; max: number; onChange: (value: number) => void; colors: AppColors; styles: ReturnType<typeof makeStyles>; editValueLabel?: (label: string) => string }) {
  const ref = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const momentum = useRef(false);
  const lastTap = useRef(0);
  const skipSyncValue = useRef<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (editing) return;
    if (skipSyncValue.current === value) {
      skipSyncValue.current = null;
      return;
    }
    requestAnimationFrame(() => ref.current?.scrollTo({ y: value * ROW_HEIGHT, animated: false }));
  }, [editing, value]);

  useEffect(() => {
    if (editing) requestAnimationFrame(() => inputRef.current?.focus());
  }, [editing]);

  function commit(offsetY: number) {
    const nextValue = wheelValueAtOffset(offsetY, ROW_HEIGHT, max);
    skipSyncValue.current = nextValue;
    ref.current?.scrollTo({ y: nextValue * ROW_HEIGHT, animated: true });
    onChange(nextValue);
  }

  function finishManual() {
    onChange(clampClockValue(draft, max));
    setEditing(false);
  }

  function handleTouchEnd() {
    const now = Date.now();
    if (now - lastTap.current < 250) {
      setDraft(String(value));
      setEditing(true);
    }
    lastTap.current = now;
  }

  function handleAccessibilityAction(event: { nativeEvent: { actionName: string } }) {
    if (event.nativeEvent.actionName === 'increment') onChange(value >= max ? 0 : value + 1);
    else if (event.nativeEvent.actionName === 'decrement') onChange(value <= 0 ? max : value - 1);
  }

  return (
    <View style={styles.field}>
      {editing ? (
        <TextInput ref={inputRef} style={styles.wheelInput} value={draft} onChangeText={setDraft} onBlur={finishManual} onSubmitEditing={() => inputRef.current?.blur()} keyboardType="number-pad" maxLength={2} selectTextOnFocus accessibilityLabel={label} />
      ) : (
        <ScrollView
          ref={ref}
          style={styles.wheel}
          contentContainerStyle={styles.wheelContent}
          showsVerticalScrollIndicator={false}
          decelerationRate="normal"
          onTouchEnd={handleTouchEnd}
          onMomentumScrollBegin={() => { momentum.current = true; }}
          onMomentumScrollEnd={event => { momentum.current = false; commit(event.nativeEvent.contentOffset.y); }}
          onScrollEndDrag={event => { const offsetY = event.nativeEvent.contentOffset.y; requestAnimationFrame(() => { if (!momentum.current) commit(offsetY); }); }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min: 0, max, now: value, text: String(value).padStart(2, '0') }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={handleAccessibilityAction}
        >
          {Array.from({ length: max + 1 }, (_, item) => (
            <View key={item} style={styles.wheelRow}><Text style={[styles.wheelText, item === value && { color: colors.primaryText }]}>{String(item).padStart(2, '0')}</Text></View>
          ))}
        </ScrollView>
      )}
      <Text style={styles.label}>{label}</Text>
      {!editing && (
        <TouchableOpacity
          onPress={() => { setDraft(String(value)); setEditing(true); }}
          style={styles.editBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={editValueLabel?.(label) ?? `Type ${label} value`}
        >
          <Text style={styles.editBtnText}>✎</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function DurationClockInput({ value, onChange, colors, hoursLabel = 'HH', minutesLabel = 'MM', editValueLabel }: Props) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.clock}>
      <Wheel label={hoursLabel} value={value.hours} max={24} onChange={hours => onChange({ hours, minutes: hours === 24 ? 0 : value.minutes })} colors={colors} styles={styles} editValueLabel={editValueLabel} />
      <Text style={styles.separator}>:</Text>
      <Wheel label={minutesLabel} value={value.minutes} max={59} onChange={minutes => onChange({ hours: value.hours, minutes: value.hours === 24 ? 0 : minutes })} colors={colors} styles={styles} editValueLabel={editValueLabel} />
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    clock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginVertical: 12 },
    field: { alignItems: 'center' },
    wheel: { width: 70, height: ROW_HEIGHT * 3, borderWidth: 1.5, borderColor: C.line2, borderRadius: Radii.md, backgroundColor: C.surface2 },
    wheelContent: { paddingVertical: ROW_HEIGHT },
    wheelRow: { height: ROW_HEIGHT, justifyContent: 'center', alignItems: 'center' },
    wheelText: { color: C.muted, fontSize: 22, fontFamily: FontFamily.extraBold },
    wheelInput: { width: 70, height: ROW_HEIGHT * 3, borderWidth: 1.5, borderColor: C.primary, borderRadius: Radii.md, backgroundColor: C.surface2, color: C.inkDark, fontSize: 22, fontFamily: FontFamily.extraBold, textAlign: 'center' },
    label: { marginTop: 4, color: C.muted, fontSize: 10, fontFamily: FontFamily.bold },
    separator: { color: C.inkDark, fontSize: 24, fontFamily: FontFamily.extraBold },
    editBtn: { marginTop: 4, minWidth: 48, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
    editBtnText: { color: C.primaryText, fontSize: 15 },
  });
}
