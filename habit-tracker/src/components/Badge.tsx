import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Path, G } from 'react-native-svg';
import { TIER_COINS, EMBLEM_TINT, EMBLEM_PATH } from '../config/badgeTiers';
import type { Tier, Emblem } from '../config/achievements';
import { AppColors, FontFamily } from '../config/theme';

interface Props {
  tier: Tier;
  emblem: Emblem;
  label?: string;
  sub?: string;
  progress?: number; // 0-100, shows the progress pill when unearned
  locked?: boolean;
  size?: number; // coin diameter, default 96
  colors: AppColors;
}

export function Badge({ tier, emblem, label, sub, progress, locked, size = 96, colors }: Props) {
  const t = TIER_COINS[tier];
  const tint = locked ? colors.faint : EMBLEM_TINT[emblem];
  const gradId = `${tier}-${emblem}`;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={`ring-${gradId}`} cx="50%" cy="38%" r="65%">
              <Stop offset="0" stopColor={t[0]} />
              <Stop offset="0.62" stopColor={t[1]} />
              <Stop offset="1" stopColor={t[2]} />
            </RadialGradient>
            <RadialGradient id={`disc-${gradId}`} cx="50%" cy="40%" r="60%">
              <Stop offset="0" stopColor={t[3]} />
              <Stop offset="1" stopColor={t[4]} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill={`url(#ring-${gradId})`} />
          <Circle cx="50" cy="50" r="41" fill={t[5]} />
          <Circle cx="50" cy="50" r="35" fill={`url(#disc-${gradId})`} />
          <G transform="translate(30,30) scale(1.66)" stroke={tint} strokeWidth={2.05}
             fill="none" strokeLinecap="round" strokeLinejoin="round">
            <Path d={EMBLEM_PATH[emblem]} />
          </G>
          <Circle cx="42" cy="26" r="14" fill="rgba(255,255,255,0.28)" />
          {locked && <Circle cx="50" cy="50" r="50" fill="rgba(233,236,238,0.72)" />}
          {locked && (
            <G transform="translate(37,37) scale(1.1)" stroke={colors.ink2} strokeWidth={2.1}
               fill="none" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M4.5 10.5h15v10h-15z M8 10.5V7a4 4 0 0 1 8 0v3.5" />
            </G>
          )}
        </Svg>

        {progress != null && (
          <View style={[styles.pillTrack, { width: size * 0.52 }]}>
            <View style={[styles.pillFill, { width: `${Math.max(0, Math.min(100, progress))}%` }]} />
          </View>
        )}
      </View>

      {!!label && <Text style={styles.label} numberOfLines={2}>{label}</Text>}
      {!!sub && <Text style={styles.sub} numberOfLines={1}>{sub}</Text>}
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: { alignItems: 'center', width: '100%' },
    pillTrack: {
      position: 'absolute', alignSelf: 'center', bottom: -3, height: 10, borderRadius: 999,
      overflow: 'hidden', backgroundColor: colors.surface2,
    },
    pillFill: { height: '100%', borderRadius: 999, backgroundColor: colors.primary },
    label: { marginTop: 9, fontSize: 11, fontFamily: FontFamily.bold, textAlign: 'center', color: colors.inkDark },
    sub: { marginTop: 2, fontSize: 10.5, fontFamily: FontFamily.semiBold, textAlign: 'center', color: colors.muted },
  });
}
