import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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

// 8 alternating light/dark lobes baked around the ring — a static approximation of the
// conic-gradient + soft-light luster from the mock (react-native-svg has no blend modes).
const LOBE_COUNT = 8;
const LOBE_ARC = 360 / LOBE_COUNT;

export function Badge({ tier, emblem, label, sub, progress, locked, size = 96, colors }: Props) {
  const ramp = TIER_COINS[tier];
  const t = useMemo(() => (locked ? (ramp.map(desaturate) as typeof ramp) : ramp), [ramp, locked]);
  const tint = locked ? colors.faint : EMBLEM_TINT[emblem];
  const gradId = `${tier}-${emblem}-${locked ? 'l' : 'u'}`;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={`ring-${gradId}`} cx="50%" cy="35%" r="68%">
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
          </Defs>

          {/* 1. Ambient contact shadow */}
          <Ellipse cx="50" cy="88" rx="30" ry="7" fill={`url(#shadow-${gradId})`} />

          {/* 2. Ring: 5-stop radial gradient */}
          <Circle cx="50" cy="50" r="50" fill={`url(#ring-${gradId})`} />

          {/* 3. Ring luster: 8 baked lobes (light/dark) standing in for the conic sweep */}
          {Array.from({ length: LOBE_COUNT }).map((_, i) => (
            <Path
              key={i}
              d={ringLobeArc(50, 50, 46, i * LOBE_ARC, (i + 1) * LOBE_ARC)}
              stroke={i % 2 === 0 ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.16)'}
              strokeWidth={7}
              fill="none"
              strokeLinecap="round"
            />
          ))}

          {/* 4. Bevel edge */}
          <Circle cx="50" cy="50" r="41" fill={t[5]} />

          {/* 5. Recessed disc + inset ring for a pressed-in feel */}
          <Circle cx="50" cy="50" r="35" fill={`url(#disc-${gradId})`} />
          <Circle cx="50" cy="50" r="34" stroke="rgba(0,0,0,0.14)" strokeWidth={1.5} fill="none" />

          {/* 6. Halo behind emblem */}
          {!locked && <Circle cx="50" cy="50" r="24" fill={`url(#halo-${gradId})`} />}

          {/* 7. Emblem — double drop-shadow (dark below, light above) to emboss */}
          <G transform="translate(30.6,30.6) scale(1.66)" stroke="rgba(0,0,0,0.32)" strokeWidth={2.05}
             fill="none" strokeLinecap="round" strokeLinejoin="round">
            <Path d={EMBLEM_PATH[emblem]} />
          </G>
          <G transform="translate(29.6,29.6) scale(1.66)" stroke="rgba(255,255,255,0.4)" strokeWidth={2.05}
             fill="none" strokeLinecap="round" strokeLinejoin="round">
            <Path d={EMBLEM_PATH[emblem]} />
          </G>
          <G transform="translate(30,30) scale(1.66)" stroke={tint} strokeWidth={2.05}
             fill="none" strokeLinecap="round" strokeLinejoin="round">
            <Path d={EMBLEM_PATH[emblem]} />
          </G>

          {/* 8. Broad gloss */}
          <Circle cx="42" cy="26" r="14" fill="rgba(255,255,255,0.28)" />
          {/* 9. Crisp hotspot */}
          <Circle cx="35" cy="17" r="3" fill="rgba(255,255,255,0.85)" />
          {/* 10. Lower reflected rim light */}
          <Ellipse cx="50" cy="80" rx="16" ry="4" fill="rgba(255,255,255,0.18)" />

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

/** SVG arc path for a ring-hugging stroke segment between two angles (degrees, 0 = up). */
function ringLobeArc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(fromDeg));
  const y1 = cy + r * Math.sin(toRad(fromDeg));
  const x2 = cx + r * Math.cos(toRad(toDeg));
  const y2 = cy + r * Math.sin(toRad(toDeg));
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: { alignItems: 'center', width: '100%' },
    pillTrack: {
      position: 'absolute', alignSelf: 'center', bottom: -3, height: 10, borderRadius: Radii.pill,
      overflow: 'hidden', backgroundColor: colors.surface2,
    },
    pillFill: { height: '100%', borderRadius: Radii.pill, backgroundColor: colors.primary },
    label: { marginTop: 9, fontSize: 11, fontFamily: FontFamily.bold, textAlign: 'center', color: colors.inkDark },
    sub: { marginTop: 2, fontSize: 10.5, fontFamily: FontFamily.semiBold, textAlign: 'center', color: colors.muted },
  });
}
