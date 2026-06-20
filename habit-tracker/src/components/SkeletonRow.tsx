import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { AppColors, Radii, Spacing } from '../config/theme';
import { useReduceMotion } from '../hooks/useReduceMotion';

export function SkeletonRow({ colors }: { colors: AppColors }) {
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 750, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, reduceMotion]);

  const bg = colors.surface2;
  return (
    <Animated.View style={[styles.row, { opacity, borderBottomColor: colors.line, backgroundColor: colors.surface }]}>
      <View style={[styles.check, { backgroundColor: bg }]} />
      <View style={styles.body}>
        <View style={[styles.line1, { backgroundColor: bg }]} />
        <View style={[styles.line2, { backgroundColor: bg }]} />
      </View>
      <View style={[styles.pts, { backgroundColor: bg }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 15,
    borderBottomWidth: 1,
    gap: 12,
  },
  check: { width: 28, height: 28, borderRadius: 14 },
  body: { flex: 1, gap: 8 },
  line1: { height: 14, borderRadius: Radii.sm, width: '65%' },
  line2: { height: 11, borderRadius: Radii.sm, width: '42%' },
  pts: { width: 34, height: 15, borderRadius: Radii.sm },
});
