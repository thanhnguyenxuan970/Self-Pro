import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppColors, FontFamily, Radii, Typography } from '../config/theme';
import { useTheme } from '../hooks/useSettings';

export function PhotoSlot({ uri, label, locked, actionLabel, onPress }: {
  uri?: string | null; label: string; locked?: boolean; actionLabel: string; onPress?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.slot}>
      {uri ? <Image source={{ uri }} style={styles.image} /> : onPress && !locked ? (
        <TouchableOpacity style={styles.empty} onPress={onPress} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={styles.action}>📷 {actionLabel}</Text>
        </TouchableOpacity>
      ) : <View style={[styles.empty, locked && styles.locked]}><Text style={styles.lockedText}>{locked ? `🔒 ${actionLabel}` : actionLabel}</Text></View>}
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function makeStyles(C: AppColors) { return StyleSheet.create({
  slot: { flex: 1, gap: 6 },
  image: { width: '100%', aspectRatio: 1, borderRadius: Radii.lg, backgroundColor: C.surface2 },
  empty: { width: '100%', aspectRatio: 1, borderRadius: Radii.lg, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, padding: 8 },
  locked: { backgroundColor: C.surface2, borderStyle: 'dashed' },
  action: { ...Typography.caption, color: C.primary, fontFamily: FontFamily.semiBold, textAlign: 'center' },
  lockedText: { ...Typography.caption, color: C.muted, textAlign: 'center' },
  label: { ...Typography.caption, color: C.ink2, textAlign: 'center' },
}); }
