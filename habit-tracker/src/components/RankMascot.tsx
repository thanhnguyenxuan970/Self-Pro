// RankMascot.tsx
// Renders any rank's star-sprite from ranks.config, runs its looping "absurd"
// signature animation, and fires the level-up haptic + pop on demand.
//
// Adapted from Docs/rank/rankmascot.tsx:
//   - Uses React Native built-in Animated (no react-native-reanimated needed)
//   - Sound removed (expo-av unavailable in this project)
//   - skewX channel skipped (not supported by native driver)
//
// Usage:
//   <RankMascot tier={2} size={120} />                       // idle loop
//   const ref = useRef<RankMascotHandle>(null);
//   <RankMascot ref={ref} tier={2} /> ... ref.current?.playRankUp();

import React, { forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { G, Polygon, Path, Circle, Rect, Ellipse, Line } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { RANKS, STAR_POINTS, type Channel, type SvgEl } from '../config/ranks.config';
import { playRankSound } from '../audio/rankSound';

// Interpolate a channel from p (0→1); returns constant dflt if channel absent
function chanInterp(p: Animated.Value, arr: Channel | undefined, dflt: number) {
  if (!arr || arr.length < 2) {
    return p.interpolate({ inputRange: [0, 1], outputRange: [dflt, dflt] });
  }
  return p.interpolate({
    inputRange: arr.map(k => k[0]),
    outputRange: arr.map(k => k[1]),
    extrapolate: 'clamp',
  });
}

// Same but output as '45deg' strings for rotate transform
function chanInterpDeg(p: Animated.Value, arr: Channel | undefined, dflt: number) {
  if (!arr || arr.length < 2) {
    return p.interpolate({ inputRange: [0, 1], outputRange: [`${dflt}deg`, `${dflt}deg`] });
  }
  return p.interpolate({
    inputRange: arr.map(k => k[0]),
    outputRange: arr.map(k => `${k[1]}deg`),
    extrapolate: 'clamp',
  });
}

function fireHaptic(kind: 'success' | 'heavy-success') {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  if (kind === 'heavy-success') {
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 120);
  }
}

function renderEl(el: SvgEl, i: number) {
  const stroke = el.stroke;
  const sw = el.sw;
  const fill = el.fill ?? (el.stroke ? 'none' : undefined);
  const common = { fill, stroke, strokeWidth: sw, strokeLinecap: el.cap };
  switch (el.t) {
    case 'path':    return <Path key={i} {...common} d={el.d!} />;
    case 'polygon': return <Polygon key={i} {...common} points={el.points!} />;
    case 'circle':  return <Circle key={i} {...common} cx={el.cx} cy={el.cy} r={el.r} />;
    case 'rect':    return <Rect key={i} {...common} x={el.x} y={el.y} width={el.width} height={el.height} rx={2} />;
    case 'ellipse': return <Ellipse key={i} {...common} cx={el.cx} cy={el.cy} rx={el.rx} ry={el.ry} />;
    case 'line':    return <Line key={i} {...common} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} />;
  }
}

export interface RankMascotHandle { playRankUp: () => void; }
interface Props { tier: number; size?: number; loop?: boolean; reduceMotion?: boolean; }

export const RankMascot = forwardRef<RankMascotHandle, Props>(
  ({ tier, size = 120, loop = true, reduceMotion = false }, ref) => {
    const rank = RANKS[Math.min(Math.max(tier, 0), RANKS.length - 1)];
    const p = useRef(new Animated.Value(0)).current;
    const pop = useRef(new Animated.Value(1)).current;
    const loopAnim = useRef<Animated.CompositeAnimation | null>(null);
    const c = rank.anim.channels;

    useEffect(() => {
      loopAnim.current?.stop();
      p.setValue(0);
      if (reduceMotion || !loop || !rank.anim.loop) return;
      loopAnim.current = Animated.loop(
        Animated.timing(p, {
          toValue: 1,
          duration: rank.anim.duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      loopAnim.current.start();
      return () => loopAnim.current?.stop();
    }, [tier, loop, reduceMotion]);

    useImperativeHandle(ref, () => ({
      playRankUp() {
        fireHaptic(rank.haptic);
        // Fire sound 50ms after haptic — compensates for haptic motor latency.
        setTimeout(() => playRankSound(rank.tier), 50);
        pop.setValue(1);
        Animated.sequence([
          Animated.timing(pop, {
            toValue: 1.18,
            duration: 180,
            easing: Easing.out(Easing.back(2)),
            useNativeDriver: true,
          }),
          Animated.timing(pop, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }),
        ]).start();
      },
    }), [tier]);

    // Outer View handles level-up pop scale; inner View handles loop animation.
    // skewX channel intentionally skipped — not supported by useNativeDriver.
    return (
      <Animated.View
        style={{ width: size, height: size, transform: [{ scale: pop }] }}
      >
        <Animated.View
          style={{
            width: size,
            height: size,
            transform: [
              { translateX: chanInterp(p, c.translateX, 0) as any },
              { translateY: chanInterp(p, c.translateY, 0) as any },
              { rotate: chanInterpDeg(p, c.rotate, 0) as any },
              { scaleX: chanInterp(p, c.scaleX, 1) as any },
              { scaleY: chanInterp(p, c.scaleY, 1) as any },
            ],
          }}
        >
          <Svg width={size} height={size} viewBox="-60 -60 120 120">
            <G>
              {rank.limbs.map((d, i) => (
                <Path
                  key={`l${i}`}
                  d={d}
                  stroke={rank.edge}
                  strokeWidth={7}
                  fill="none"
                  strokeLinecap="round"
                />
              ))}
              <Polygon
                points={STAR_POINTS}
                fill={rank.color}
                stroke={rank.edge}
                strokeWidth={1.5}
              />
              {rank.face.map(renderEl)}
            </G>
          </Svg>
        </Animated.View>
      </Animated.View>
    );
  },
);
