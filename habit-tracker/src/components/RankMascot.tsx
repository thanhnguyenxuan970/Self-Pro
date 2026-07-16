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
import Svg, { Defs, G, Polygon, Path, Circle, Ellipse, Line, RadialGradient, Rect, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { getRankConfigByTier, starPoints, type Channel, type SvgEl } from '../config/ranks.config';
import { playRankSound } from '../audio/rankSound';
import { useTranslations } from '../hooks/useSettings';
import { shouldRunRankLoop } from '../lib/rankPresentation';

// Interpolate a channel from p (0→1); returns constant dflt if channel absent
function chanInterp(p: Animated.Value, arr: Channel | undefined, dflt: number): Animated.AnimatedInterpolation<number> {
  if (!arr || arr.length < 2) {
    return p.interpolate({ inputRange: [0, 1], outputRange: [dflt, dflt] }) as Animated.AnimatedInterpolation<number>;
  }
  return p.interpolate({
    inputRange: arr.map(k => k[0]),
    outputRange: arr.map(k => k[1]),
    extrapolate: 'clamp',
  }) as Animated.AnimatedInterpolation<number>;
}

// Same but output as '45deg' strings for rotate transform
function chanInterpDeg(p: Animated.Value, arr: Channel | undefined, dflt: number): Animated.AnimatedInterpolation<string> {
  if (!arr || arr.length < 2) {
    return p.interpolate({ inputRange: [0, 1], outputRange: [`${dflt}deg`, `${dflt}deg`] }) as Animated.AnimatedInterpolation<string>;
  }
  return p.interpolate({
    inputRange: arr.map(k => k[0]),
    outputRange: arr.map(k => `${k[1]}deg`),
    extrapolate: 'clamp',
  }) as Animated.AnimatedInterpolation<string>;
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
  const common = { fill, stroke, strokeWidth: sw, strokeLinecap: el.cap, opacity: el.opacity };
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
    const rank = getRankConfigByTier(tier);
    const t = useTranslations();
    const p = useRef(new Animated.Value(0)).current;
    const pop = useRef(new Animated.Value(1)).current;
    const gradientId = useRef(`rank_luminous_${Math.random().toString(36).slice(2)}`).current;
    const loopAnim = useRef<Animated.CompositeAnimation | null>(null);
    const c = rank.anim.channels;

    useEffect(() => {
      loopAnim.current?.stop();
      p.setValue(0);
      if (!shouldRunRankLoop({ reduceMotion, loop, hasLoopAnimation: rank.anim.loop })) return;
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
            duration: 160,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(pop, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.quad),
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
        accessible
        accessibilityRole="image"
        accessibilityLabel={t.rankNameMap[rank.name] ?? rank.name}
      >
        <Animated.View
          style={{
            width: size,
            height: size,
            transform: [
              { translateX: chanInterp(p, c.translateX, 0) },
              { translateY: chanInterp(p, c.translateY, 0) },
              { rotate: chanInterpDeg(p, c.rotate, 0) },
              { scale: chanInterp(p, c.scale, 1) },
              { scaleX: chanInterp(p, c.scaleX, 1) },
              { scaleY: chanInterp(p, c.scaleY, 1) },
            ],
          }}
        >
          <Svg width={size} height={size} viewBox="-60 -60 120 120">
            <G>
              {rank.bodyStyle === 'luminous' ? (
                <Defs>
                  <RadialGradient id={gradientId} cx="50%" cy="40%" r="70%">
                    <Stop offset="0" stopColor="#FFFFFF" />
                    <Stop offset="0.55" stopColor="#FFF3D6" />
                    <Stop offset="1" stopColor="#F0D084" />
                  </RadialGradient>
                </Defs>
              ) : null}
              {rank.back.map(renderEl)}
              {rank.bodyStyle === 'luminous' ? <Polygon points={starPoints({ ...rank.geometry, outer: rank.geometry.outer + 7, innerRatio: 0.54 })} fill="#FFF6DC" opacity={0.25} /> : null}
              <Polygon
                points={starPoints(rank.geometry)}
                fill={rank.bodyStyle === 'luminous' ? `url(#${gradientId})` : rank.color}
                stroke={rank.edge}
                strokeWidth={rank.tier >= 6 ? 3 : 2.4}
              />
              {rank.bodyStyle === 'luminous' ? <Circle cx={0} cy={-3} r={9} fill="#FFFFFF" opacity={0.55} /> : null}
              {rank.face.map(renderEl)}
              {rank.front.map(renderEl)}
              {Array.from({ length: rank.band + 1 }, (_, index) => {
                const x = -(rank.band * 5) + index * 10;
                const color = ['#C8C2E0', '#7EC0FF', '#D7A6FF', '#FFDD6B', '#FF9ECB'][rank.band];
                return <Polygon key={`pip-${index}`} points={`${x},47.8 ${x + 2.8},51 ${x},54.2 ${x - 2.8},51`} fill={color} opacity={0.95} />;
              })}
            </G>
          </Svg>
        </Animated.View>
      </Animated.View>
    );
  },
);
