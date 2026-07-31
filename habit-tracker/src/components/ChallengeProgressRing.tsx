import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppColors, FontFamily, Typography } from '../config/theme';
import { useTheme } from '../hooks/useSettings';

type Props = {
  fraction: number; // 0..1
  size?: number;
  muted?: boolean;
  strokeWidth?: number;
  label: string;    // e.g. "Ngày 5/21"
  glowing?: boolean;
};

export const ChallengeProgressRing = React.memo(function ChallengeProgressRing({ fraction, size = 184, strokeWidth = 16, label, muted = false, glowing = false }: Props) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, fraction));
  const dashOffset = circumference * (1 - clamped);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={C.surface2}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {glowing && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={C.primary}
            strokeWidth={strokeWidth + 8}
            opacity={0.16}
            fill="none"
          />
        )}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={muted ? C.faint : C.primary}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          fill="none"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={[styles.center, muted && styles.muted]}>
        <Text style={[styles.percent, muted && styles.mutedText]}>{Math.round(clamped * 100)}%</Text>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
});

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    center: { position: 'absolute', alignItems: 'center' },
    muted: { opacity: 0.72 },
    percent: { ...Typography.display, color: C.inkDark },
    mutedText: { color: C.faint },
    label: { ...Typography.bodyStrong, color: C.ink2, marginTop: 2 },
  });
}
