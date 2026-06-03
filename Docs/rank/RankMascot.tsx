// RankMascot.tsx
// Renders any rank's star-sprite from ranks.config, runs its looping "absurd"
// signature, and fires the level-up sound + haptic + pop on demand.
//
// Deps: react-native-svg, react-native-reanimated, expo-av, expo-haptics
//
// Usage:
//   <RankMascot tier={2} size={120} />                       // idle loop
//   const ref = useRef<RankMascotHandle>(null);
//   <RankMascot ref={ref} tier={2} />  ... ref.current?.playRankUp();

import React, { forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { View } from 'react-native';
import Svg, { G, Polygon, Path, Circle, Rect, Ellipse, Line } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence,
  interpolate, Easing, cancelAnimation, runOnJS,
} from 'react-native-reanimated';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { RANKS, STAR_POINTS, type Channel, type SvgEl } from './ranks.config';

// map sfx keys -> bundled files (adjust paths to your assets folder)
const SOUNDS: Record<string, any> = {
  'delulu':         require('../../assets/sfx/delulu.m4a'),
  'mewing':         require('../../assets/sfx/mewing.m4a'),
  'rizz':           require('../../assets/sfx/rizz.m4a'),
  'gigachad':       require('../../assets/sfx/gigachad.m4a'),
  'aura-farmer':    require('../../assets/sfx/aura-farmer.m4a'),
  'main-character': require('../../assets/sfx/main-character.m4a'),
  'goated':         require('../../assets/sfx/goated.m4a'),
};

let soundEnabled = true;                       // wire to user setting
export const setRankSoundEnabled = (v: boolean) => { soundEnabled = v; };

async function playSfx(key: string) {
  if (!soundEnabled) return;
  try {
    const { sound } = await Audio.Sound.createAsync(SOUNDS[key], { shouldPlay: true, volume: 0.9 });
    sound.setOnPlaybackStatusUpdate(s => { if (s.isLoaded && s.didJustFinish) sound.unloadAsync(); });
  } catch { /* asset missing in dev — ignore */ }
}

function fireHaptic(kind: 'success' | 'heavy-success') {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  if (kind === 'heavy-success') {
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 120);
  }
}

// interpolate one channel at progress p; identity default
function chan(p: number, arr: Channel | undefined, dflt: number): number {
  'worklet';
  if (!arr || arr.length === 0) return dflt;
  const ins = arr.map(k => k[0]);
  const outs = arr.map(k => k[1]);
  return interpolate(p, ins, outs);
}

function renderEl(el: SvgEl, i: number) {
  const stroke = el.stroke, sw = el.sw, fill = el.fill ?? (el.stroke ? 'none' : undefined);
  const common = { key: i, fill, stroke, strokeWidth: sw, strokeLinecap: el.cap };
  switch (el.t) {
    case 'path':    return <Path {...common} d={el.d!} />;
    case 'polygon': return <Polygon {...common} points={el.points!} />;
    case 'circle':  return <Circle {...common} cx={el.cx} cy={el.cy} r={el.r} />;
    case 'rect':    return <Rect {...common} x={el.x} y={el.y} width={el.width} height={el.height} rx={2} />;
    case 'ellipse': return <Ellipse {...common} cx={el.cx} cy={el.cy} rx={el.rx} ry={el.ry} />;
    case 'line':    return <Line {...common} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} />;
  }
}

export interface RankMascotHandle { playRankUp: () => void; }
interface Props { tier: number; size?: number; loop?: boolean; reduceMotion?: boolean; }

export const RankMascot = forwardRef<RankMascotHandle, Props>(
  ({ tier, size = 120, loop = true, reduceMotion = false }, ref) => {
    const rank = RANKS[tier];
    const p = useSharedValue(0);   // 0..1 loop progress
    const pop = useSharedValue(1); // level-up overshoot multiplier
    const c = rank.anim.channels;

    useEffect(() => {
      if (reduceMotion || !loop || !rank.anim.loop) { p.value = 0; return; }
      p.value = 0;
      p.value = withRepeat(withTiming(1, { duration: rank.anim.duration, easing: Easing.linear }), -1, false);
      return () => cancelAnimation(p);
    }, [tier, loop, reduceMotion]);

    useImperativeHandle(ref, () => ({
      playRankUp() {
        runOnJS(playSfx)(rank.sfx);
        runOnJS(fireHaptic)(rank.haptic);
        pop.value = withSequence(
          withTiming(1.18, { duration: 180, easing: Easing.out(Easing.back(2)) }),
          withTiming(1, { duration: 260 }),
        );
      },
    }), [tier]);

    const style = useAnimatedStyle(() => {
      const t = p.value;
      return {
        transform: [
          { translateX: chan(t, c.translateX, 0) },
          { translateY: chan(t, c.translateY, 0) },
          { rotate: `${chan(t, c.rotate, 0)}deg` },
          { skewX: `${chan(t, c.skewX, 0)}deg` },
          { scaleX: chan(t, c.scaleX, 1) * chan(t, c.scale, 1) * pop.value },
          { scaleY: chan(t, c.scaleY, 1) * chan(t, c.scale, 1) * pop.value },
        ],
      };
    });

    return (
      <Animated.View style={[{ width: size, height: size }, style]}>
        <Svg width={size} height={size} viewBox="-60 -60 120 120">
          <G>
            {rank.limbs.map((d, i) => (
              <Path key={`l${i}`} d={d} stroke={rank.edge} strokeWidth={7} fill="none" strokeLinecap="round" />
            ))}
            <Polygon points={STAR_POINTS} fill={rank.color} stroke={rank.edge} strokeWidth={1.5} />
            {rank.face.map(renderEl)}
          </G>
        </Svg>
      </Animated.View>
    );
  },
);
