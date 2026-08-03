import React, { useMemo } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse, Path, G } from 'react-native-svg';
import { TIER_COINS, EMBLEM_TINT, EMBLEM_PATH } from '../config/badgeTiers';
import type { Tier, Emblem } from '../config/achievements';
import { AppColors, FontFamily, Radii } from '../config/theme';

interface Props {
  tier: Tier;
  emblem: Emblem;
  label?: string;
  sub?: string;
  progress?: number; // 0-100, shows the progress pill when unearned
  locked?: boolean;
  size?: number; // coin diameter, default 96
  colors: AppColors;
  sheenProgress?: Animated.Value;
}

// Luminance-preserving grayscale so a locked coin still reads as "this tier's metal", desaturated —
// never a flat gray wash (that was the old bug: it hid the tier color entirely).
function desaturate(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const mix = (c: number) => Math.round(c * 0.35 + l * 0.65);
  const hex2 = (c: number) => c.toString(16).padStart(2, '0');
  return `#${hex2(mix(r))}${hex2(mix(g))}${hex2(mix(b))}`;
}

const RARITY_GLOW: Record<Tier, [string, number, number]> = {
  iron: ['transparent', 0, 0],
  bronze: ['#cf8a44', 0.08, 3],
  silver: ['#c1cbd4', 0.12, 4],
  gold: ['#e6b52e', 0.3, 7],
  platinum: ['#bfdae4', 0.38, 9],
  diamond: ['#7fd6e8', 0.52, 12],
};

export const Badge = React.memo(function Badge({ tier, emblem, label, sub, progress, locked, size = 96, colors, sheenProgress }: Props) {
  const ramp = TIER_COINS[tier];
  const t = useMemo(() => (locked ? (ramp.map(desaturate) as typeof ramp) : ramp), [ramp, locked]);
  const tint = locked ? desaturate(EMBLEM_TINT[emblem]) : EMBLEM_TINT[emblem];
  const [glowColor, glowOpacity, glowRadius] = RARITY_GLOW[tier];
  const glowPadding = locked ? 0 : glowRadius;
  const outerPadding = Math.max(6, glowPadding);
  const glowInset = (glowPadding * 100) / size;
  const outerInset = (outerPadding * 100) / size;
  const svgSize = size + outerPadding * 2;
  const gradId = `${tier}-${emblem}-${locked ? 'l' : 'u'}`;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg
          width={svgSize}
          height={svgSize}
          viewBox={`${-outerInset} ${-outerInset} ${100 + outerInset * 2} ${100 + outerInset * 2}`}
          style={{ position: 'absolute', left: -outerPadding, top: -outerPadding }}
        >
          <Defs>
            <RadialGradient id={`glow-${gradId}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0.6" stopColor={glowColor} stopOpacity={glowOpacity} />
              <Stop offset="1" stopColor={glowColor} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`ring-${gradId}`} cx="35%" cy="24%" r="76%">
              <Stop offset="0" stopColor={t[0]} />
              <Stop offset="0.3" stopColor={t[1]} />
              <Stop offset="0.55" stopColor={t[2]} />
              <Stop offset="0.8" stopColor={t[3]} />
              <Stop offset="1" stopColor={t[4]} />
            </RadialGradient>
            <RadialGradient id={`disc-${gradId}`} cx="50%" cy="40%" r="60%">
              <Stop offset="0" stopColor={t[6]} />
              <Stop offset="0.6" stopColor={t[7]} />
              <Stop offset="1" stopColor={t[8]} />
            </RadialGradient>
            <RadialGradient id={`shadow-${gradId}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="rgba(0,0,0,0.32)" />
              <Stop offset="1" stopColor="rgba(0,0,0,0)" />
            </RadialGradient>
            <RadialGradient id={`halo-${gradId}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={tint} stopOpacity={0.22} />
              <Stop offset="1" stopColor={tint} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`gloss-${gradId}`} cx="35%" cy="25%" r="65%">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.72} />
              <Stop offset="0.26" stopColor="#ffffff" stopOpacity={0.32} />
              <Stop offset="0.7" stopColor="#ffffff" stopOpacity={0.06} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
          </Defs>

          {!locked && glowOpacity > 0 && <Circle cx="50" cy="50" r={50 + glowInset} fill={`url(#glow-${gradId})`} />}
          {/* 1. Soft cast shadow */}
          <Circle cx="52" cy="54" r="51" fill="rgba(27,31,29,0.18)" />
          <Ellipse cx="50" cy="88" rx="30" ry="7" fill={`url(#shadow-${gradId})`} />

          {/* 2. Ring: 5-stop radial gradient */}
          <Circle cx="50" cy="50" r="50" fill={`url(#ring-${gradId})`} />

          {/* 3. Smooth bevel edge */}
          <Circle cx="50" cy="50" r="41" fill={t[5]} />

          {/* 5. Recessed disc + inset ring for a pressed-in feel */}
          <Circle cx="50" cy="50" r="35" fill={`url(#disc-${gradId})`} />
          <Circle cx="50" cy="50" r="34" stroke="rgba(0,0,0,0.14)" strokeWidth={1.5} fill="none" />

          {/* 6. Halo behind emblem */}
          {!locked && <Circle cx="50" cy="50" r="24" fill={`url(#halo-${gradId})`} />}

          {/* 7. Emblem — double drop-shadow (dark below, light above) to emboss */}
          <G transform="translate(25.8,25.8) scale(1.51)" stroke="rgba(0,0,0,0.32)" strokeWidth={2}
             fill="none" strokeLinecap="round" strokeLinejoin="round">
            <Path d={EMBLEM_PATH[emblem]} />
          </G>
          <G transform="translate(24.8,24.8) scale(1.51)" stroke="rgba(255,255,255,0.4)" strokeWidth={2}
             fill="none" strokeLinecap="round" strokeLinejoin="round">
            <Path d={EMBLEM_PATH[emblem]} />
          </G>
          <G transform="translate(25.2,25.2) scale(1.51)" stroke={tint} strokeOpacity={locked ? 0.55 : 1} strokeWidth={2}
             fill="none" strokeLinecap="round" strokeLinejoin="round">
            <Path d={EMBLEM_PATH[emblem]} />
          </G>

          {/* 8. Broad upper-left reflection */}
          <Circle cx="37" cy="25" r="24" fill={`url(#gloss-${gradId})`} />
          {/* 9. Crisp hotspot */}
          <Circle cx="33" cy="18" r="3.5" fill="rgba(255,255,255,0.9)" />
          {/* 10. Lower reflected rim light */}
          <Ellipse cx="50" cy="80" rx="16" ry="4" fill="rgba(255,255,255,0.18)" />

          {locked && (
            <G transform="translate(66,66) scale(0.72)" stroke={colors.ink2} strokeWidth={2.4}
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

        {sheenProgress && (
          <View pointerEvents="none" style={[styles.sheenClip, { width: size, height: size, borderRadius: size / 2 }]}>
            <Animated.View
              style={[styles.sheen, {
                width: size * 0.22,
                height: size * 1.8,
                top: -size * 0.4,
                transform: [
                  { translateX: sheenProgress.interpolate({ inputRange: [0, 1], outputRange: [-size * 1.5, size * 1.5] }) },
                  { rotate: '24deg' },
                ],
              }]}
            />
          </View>
        )}
      </View>

      {!!label && <Text style={styles.label} numberOfLines={2}>{label}</Text>}
      {!!sub && <Text style={styles.sub} numberOfLines={1}>{sub}</Text>}
    </View>
  );
});

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: { alignItems: 'center', width: '100%' },
    pillTrack: {
      position: 'absolute', alignSelf: 'center', bottom: -3, height: 10, borderRadius: Radii.pill,
      overflow: 'hidden', backgroundColor: colors.surface2,
    },
    pillFill: { height: '100%', borderRadius: Radii.pill, backgroundColor: colors.primary },
    sheenClip: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
    sheen: { position: 'absolute', backgroundColor: 'rgba(255,255,255,.34)', borderRadius: Radii.pill },
    label: { marginTop: 9, fontSize: 11, fontFamily: FontFamily.bold, textAlign: 'center', color: colors.inkDark },
    sub: { marginTop: 2, fontSize: 10.5, fontFamily: FontFamily.semiBold, textAlign: 'center', color: colors.muted },
  });
}
