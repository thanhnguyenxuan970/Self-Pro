import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import Svg, { Path, Defs, RadialGradient, Stop, Ellipse, Polygon } from 'react-native-svg';
import { useReduceMotion } from '../hooks/useReduceMotion';

// ---------------------------------------------------------------------------
// Calendar day badges (react-native-svg + Animated, native driver).
// Entrance-only: spring scale-in on mount, static after. No looping.
// Mount ONLY on days that earn a badge — don't render for every cell.
//   <AnimatedFireIcon/>            streak day    (orange flame)
//   <AnimatedBurningStarIcon/>     streak + best (blue flame)
//   <AnimatedStarIcon/>            best day      (gold star)
// ---------------------------------------------------------------------------

let _uid = 0;
const nextId = () => `cif${(_uid += 1)}`;

interface Palette { body: string[]; core: string; glow: string; }
const ORANGE: Palette = {
  body: ['#FFF3C4', '#FB9B2B', '#F1492A', '#C9231A'],
  core: '#FFFDEC', glow: '#FB5A1E',
};
const BLUE: Palette = {
  body: ['#FFFFFF', '#4FB6F7', '#3B6FE0', '#6D3BE0'],
  core: '#FFFFFF', glow: '#5AA0FB',
};

const BODY_D =
  'M30,6 C34,22 49,30 49,50 C49,72 41,94 30,94 C16,94 7,77 11,58 C12.5,49 20,46 24,52 C20,35 23,20 30,6 Z';

function Flame({ size, palette, reduceMotion }: { size: number; palette: Palette; reduceMotion: boolean }) {
  const id = useRef(nextId()).current;
  const W = size * 0.66;
  const H = size;
  const scaleAnim = useRef(new Animated.Value(reduceMotion ? 1 : 0.75)).current;

  useEffect(() => {
    if (reduceMotion) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 180,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={{ width: W, height: H, transform: [{ scale: scaleAnim }] }}>
      <Svg width={W} height={H} viewBox="0 0 60 106" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`${id}b`} cx="50%" cy="76%" r="64%">
            <Stop offset="0%" stopColor={palette.body[0]} />
            <Stop offset="38%" stopColor={palette.body[1]} />
            <Stop offset="76%" stopColor={palette.body[2]} />
            <Stop offset="100%" stopColor={palette.body[3]} />
          </RadialGradient>
          <RadialGradient id={`${id}g`} cx="50%" cy="60%" r="62%">
            <Stop offset="0%" stopColor={palette.glow} stopOpacity={0.7} />
            <Stop offset="100%" stopColor={palette.glow} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}c`} cx="50%" cy="70%" r="50%">
            <Stop offset="0%" stopColor={palette.core} stopOpacity={0.9} />
            <Stop offset="100%" stopColor={palette.core} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={30} cy={62} rx={30} ry={40} fill={`url(#${id}g)`} />
        <Path d={BODY_D} fill={`url(#${id}b)`} />
        <Ellipse cx={30} cy={68} rx={14} ry={20} fill={`url(#${id}c)`} />
      </Svg>
    </Animated.View>
  );
}

const STAR_PTS = '0,-30 7.4,-10.2 28.6,-9.3 12,3.9 17.7,24.4 0,12.6 -17.7,24.4 -12,3.9 -28.6,-9.3 -7.4,-10.2';

function StarIcon({ size, reduceMotion }: { size: number; reduceMotion: boolean }) {
  const id = useRef(nextId()).current;
  const scaleAnim = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 200,
      friction: 7,
      useNativeDriver: true,
    }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale: scaleAnim }] }}>
      <Svg width={size} height={size} viewBox="0 0 80 80">
        <Defs>
          <RadialGradient id={`${id}s`} cx="50%" cy="42%" r="62%">
            <Stop offset="0%" stopColor="#FFF0AC" />
            <Stop offset="55%" stopColor="#F6C92F" />
            <Stop offset="100%" stopColor="#DE9A22" />
          </RadialGradient>
        </Defs>
        <Polygon points={STAR_PTS} fill={`url(#${id}s)`} stroke="#C9881E" strokeWidth={1.5} translateX={40} translateY={40} />
      </Svg>
    </Animated.View>
  );
}

// --- Exported components used by CalendarScreen -----------------------------
export function AnimatedFireIcon({ size = 15 }: { size?: number }) {
  const reduceMotion = useReduceMotion();
  return <Flame size={size} palette={ORANGE} reduceMotion={reduceMotion} />;
}
export function AnimatedStarIcon({ size = 15 }: { size?: number }) {
  const reduceMotion = useReduceMotion();
  return <StarIcon size={size} reduceMotion={reduceMotion} />;
}
export function AnimatedBurningStarIcon({ size = 15 }: { size?: number }) {
  const reduceMotion = useReduceMotion();
  return <Flame size={size} palette={BLUE} reduceMotion={reduceMotion} />;
}

// Unused View import kept to avoid removing it from Animated.View usage above
const _view = View;
