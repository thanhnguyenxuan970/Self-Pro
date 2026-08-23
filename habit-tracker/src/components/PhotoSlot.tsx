import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { AppColors, Radii, Typography } from '../config/theme';
import { useTheme } from '../hooks/useSettings';

export function PhotoSlot({ uri, label }: {
  uri?: string | null; label: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!uri) return null;
  return (
    <View style={styles.slot}>
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="cover"
        resizeMethod="resize"
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
      />
      <Text
        style={styles.label}
        numberOfLines={2}
        accessible={false}
        importantForAccessibility="no"
        accessibilityElementsHidden
      >
        {label}
      </Text>
    </View>
  );
}

function makeStyles(C: AppColors) { return StyleSheet.create({
  slot: { flex: 1, gap: 6 },
  image: { width: '100%', aspectRatio: 1, borderRadius: Radii.lg, backgroundColor: C.surface2 },
  label: { ...Typography.caption, color: C.ink2, textAlign: 'center' },
}); }
