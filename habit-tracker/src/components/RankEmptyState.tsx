import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import { Radii, AppColors, FontFamily } from '../config/theme';
import { useTheme } from '../hooks/useSettings';
import { useTranslations } from '../hooks/useSettings';

interface Props {
  currentStars: number;
  unlockStars?: number;
  nextRankName?: string;
}

const R = 38;
const CC = 50;

export function RankEmptyState({ currentStars, unlockStars = 5, nextRankName = 'Delulu' }: Props) {
  const { colors: C } = useTheme();
  const t = useTranslations();
  const s = makeStyles(C);
  const remaining = Math.max(0, unlockStars - currentStars);
  const pct = Math.max(0, Math.min(1, currentStars / unlockStars));

  const ang = (-90 + pct * 360) * (Math.PI / 180);
  const ex = (CC + R * Math.cos(ang)).toFixed(1);
  const ey = (CC + R * Math.sin(ang)).toFixed(1);
  const large = pct > 0.5 ? 1 : 0;
  const arc =
    pct >= 0.999
      ? `M${CC},${CC - R} A${R},${R} 0 1 1 ${CC - 0.01},${CC - R}`
      : `M${CC},${CC - R} A${R},${R} 0 ${large} 1 ${ex},${ey}`;

  return (
    <View style={s.card}>
      <Svg width={96} height={96} viewBox="0 0 100 100">
        <Circle cx={CC} cy={CC} r={R} fill="none" stroke={C.surface3} strokeWidth={10} />
        {pct > 0 ? (
          <Path d={arc} fill="none" stroke={C.primary} strokeWidth={10} strokeLinecap="round" />
        ) : null}
        <Polygon
          points="0,-17 4.2,-5.7 16.2,-5.3 6.8,2.2 10,13.8 0,7.1 -10,13.8 -6.8,2.2 -16.2,-5.3 -4.2,-5.7"
          transform="translate(50,49)"
          fill="none" stroke={C.faint} strokeWidth={2.5} strokeLinejoin="round"
        />
      </Svg>

      <Text style={s.ringNum}>★ {parseFloat(currentStars.toFixed(1))} / {unlockStars}</Text>
      <Text style={s.title}>{t.noRankTitle}</Text>
      <Text style={s.sub}>{t.noRankRemaining(remaining, nextRankName)}</Text>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.line,
      borderRadius: Radii.xl, padding: 22, alignItems: 'center',
    },
    ringNum: { fontSize: 12, fontFamily: FontFamily.bold, color: C.primaryPress, marginTop: 8 },
    title: { fontSize: 18, fontFamily: FontFamily.bold, color: C.inkDark, marginTop: 8 },
    sub: { fontSize: 12.5, color: C.muted, marginTop: 4, textAlign: 'center', lineHeight: 18 },
  });
}
