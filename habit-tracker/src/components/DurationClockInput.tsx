import React, { useEffect, useMemo, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppColors, FontFamily, Radii } from '../config/theme';
import { type DurationClock } from '../utils/durationClock';

const ROW_HEIGHT = 40;

type Props = { value: DurationClock; onChange: (value: DurationClock) => void; colors: AppColors };

function Wheel({ label, value, max, onChange, colors, styles }: { label: string; value: number; max: number; onChange: (value: number) => void; colors: AppColors; styles: ReturnType<typeof makeStyles> }) {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    requestAnimationFrame(() => ref.current?.scrollTo({ y: value * ROW_HEIGHT, animated: false }));
  }, [value]);

  function commit(event: NativeSyntheticEvent<NativeScrollEvent>) {
    onChange(Math.min(max, Math.max(0, Math.round(event.nativeEvent.contentOffset.y / ROW_HEIGHT))));
  }

  return (
    <View style={styles.field} accessibilityLabel={label}>
      <ScrollView ref={ref} style={styles.wheel} contentContainerStyle={styles.wheelContent} showsVerticalScrollIndicator={false} snapToInterval={ROW_HEIGHT} decelerationRate="fast" onMomentumScrollEnd={commit}>
        {Array.from({ length: max + 1 }, (_, item) => (
          <View key={item} style={styles.wheelRow}><Text style={[styles.wheelText, item === value && { color: colors.primary }]}>{String(item).padStart(2, '0')}</Text></View>
        ))}
      </ScrollView>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

export function DurationClockInput({ value, onChange, colors }: Props) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.clock}>
      <Wheel label="HH" value={value.hours} max={24} onChange={hours => onChange({ hours, minutes: hours === 24 ? 0 : value.minutes })} colors={colors} styles={styles} />
      <Text style={styles.separator}>:</Text>
      <Wheel label="MM" value={value.minutes} max={59} onChange={minutes => onChange({ hours: value.hours, minutes: value.hours === 24 ? 0 : minutes })} colors={colors} styles={styles} />
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
    label: { marginTop: 4, color: C.muted, fontSize: 10, fontFamily: FontFamily.bold },
    separator: { color: C.inkDark, fontSize: 24, fontFamily: FontFamily.extraBold },
  });
}
