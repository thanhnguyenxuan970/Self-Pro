import React, { useEffect, useRef } from 'react';
import { Animated, View, Easing, StyleSheet } from 'react-native';
import Svg, { Path, Defs, RadialGradient, Stop, Ellipse, Circle, Polygon } from 'react-native-svg';

// ---------------------------------------------------------------------------
// Calendar day badges (pure react-native-svg + Animated, native driver).
// Mount ONLY on days that earn a badge — don't render for every cell.
//   <FireIcon/>      streak day              (orange, flowing tongues)
//   <PeakFireIcon/>  streak + daily record   (blue "hottest" flame, hidden gem)
//   <BestStarIcon/>  best day                (gold star, gentle twinkle)
// ---------------------------------------------------------------------------

let _uid = 0;
const nextId = () => `cif${(_uid += 1)}`;

interface Palette { body: string[]; tongue: string[]; core: string; glow: string; embers: string[]; }
const ORANGE: Palette = {
  body: ['#FFF3C4', '#FB9B2B', '#F1492A', '#C9231A'],
  tongue: ['#FFE89A', '#FFC24D', '#FFF3C4'],
  core: '#FFFDEC', glow: '#FB5A1E', embers: ['#FFC24D', '#FF9A3C'],
};
const BLUE: Palette = {
  body: ['#FFFFFF', '#4FB6F7', '#3B6FE0', '#6D3BE0'],
  tongue: ['#DFF6FF', '#9FE0FF', '#FFFFFF'],
  core: '#FFFFFF', glow: '#5AA0FB', embers: ['#BDEBFF', '#7FC4FF'],
};

const BODY_D =
  'M30,6 C34,22 49,30 49,50 C49,72 41,94 30,94 C16,94 7,77 11,58 C12.5,49 20,46 24,52 C20,35 23,20 30,6 Z';
const TONGUE_D = 'M10,40 C16,26 17,14 12,2 C11,-1 9,-1 8,2 C3,14 4,26 10,40 Z';

function useLoop(toCycleMs: number, startAt = 0) {
  const v = useRef(new Animated.Value(startAt)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: toCycleMs, easing: Easing.linear, useNativeDriver: true }),
    );
    anim.start();
    return () => anim.stop();
  }, [v, toCycleMs]);
  return v;
}

function Flame({ size, palette }: { size: number; palette: Palette }) {
  const id = useRef(nextId()).current;
  const W = size * 0.66;
  const H = size;

  // three tongues, phase-shifted for organic, non-repetitive flow
  const t1 = useLoop(1500, 0);
  const t2 = useLoop(1850, 0.34);
  const t3 = useLoop(1300, 0.67);
  const coreV = useRef(new Animated.Value(0)).current;
  const em1 = useLoop(2000, 0);
  const em2 = useLoop(2400, 0.5);

  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(coreV, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(coreV, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [coreV]);

  const tongueStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 0.18, 0.8, 1], outputRange: [0, 1, 0.55, 0] }),
    transform: [
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [H * 0.12, -H * 0.42] }) },
      { scaleY: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.2] }) },
    ],
  });
  const emberStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }),
    transform: [
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -H * 0.4] }) },
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) },
    ],
  });

  const tw = W * 0.46;
  const th = tw * 2;

  return (
    <View style={{ width: W, height: H }}>
      {/* static body + glow */}
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
        </Defs>
        <Ellipse cx={30} cy={62} rx={30} ry={40} fill={`url(#${id}g)`} />
        <Path d={BODY_D} fill={`url(#${id}b)`} />
      </Svg>

      {/* flowing tongues */}
      {[t1, t2, t3].map((v, i) => (
        <Animated.View
          key={i}
          style={[
            { position: 'absolute', width: tw, height: th, left: W * (0.34 + i * 0.12), bottom: H * 0.1 },
            tongueStyle(v),
          ]}
        >
          <Svg width={tw} height={th} viewBox="0 0 20 40">
            <Path d={TONGUE_D} fill={palette.tongue[i]} />
          </Svg>
        </Animated.View>
      ))}

      {/* breathing core */}
      <Animated.View
        style={{
          position: 'absolute', left: W * 0.34, bottom: H * 0.06, width: W * 0.32, height: H * 0.34,
          opacity: coreV.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
          transform: [{ scaleY: coreV.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.12] }) }],
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 20 40">
          <Ellipse cx={10} cy={26} rx={9} ry={14} fill={palette.core} opacity={0.9} />
        </Svg>
      </Animated.View>

      {/* rising embers */}
      {[em1, em2].map((v, i) => (
        <Animated.View
          key={`e${i}`}
          style={[{ position: 'absolute', width: 4, height: 4, left: W * (0.32 + i * 0.34), bottom: H * 0.5 }, emberStyle(v)]}
        >
          <Svg width={4} height={4} viewBox="0 0 4 4"><Circle cx={2} cy={2} r={2} fill={palette.embers[i]} /></Svg>
        </Animated.View>
      ))}
    </View>
  );
}

function FireIcon({ size = 15 }: { size?: number }) {
  return <Flame size={size} palette={ORANGE} />;
}
function PeakFireIcon({ size = 15 }: { size?: number }) {
  return <Flame size={size} palette={BLUE} />;
}

const STAR_PTS = '0,-30 7.4,-10.2 28.6,-9.3 12,3.9 17.7,24.4 0,12.6 -17.7,24.4 -12,3.9 -28.6,-9.3 -7.4,-10.2';

function BestStarIcon({ size = 15 }: { size?: number }) {
  const id = useRef(nextId()).current;
  const tw = useRef(new Animated.Value(0)).current;
  const spk = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(tw, { toValue: 1, duration: 1150, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(tw, { toValue: 0, duration: 1150, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const b = Animated.loop(Animated.sequence([
      Animated.delay(900),
      Animated.timing(spk, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(spk, { toValue: 0, duration: 500, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]));
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [tw, spk]);

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={{ flex: 1, transform: [{ scale: tw.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }}>
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
      <Animated.View
        style={{
          position: 'absolute', right: size * 0.06, top: size * 0.02, width: size * 0.3, height: size * 0.3,
          opacity: spk, transform: [{ scale: spk.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
        }}
      >
        <Svg width="100%" height="100%" viewBox="-8 -8 16 16">
          <Path d="M0,-7 C.9,-1.7 1.7,-.9 7,0 C1.7,.9 .9,1.7 0,7 C-.9,1.7 -1.7,.9 -7,0 C-1.7,-.9 -.9,-1.7 0,-7 Z" fill="#FFF6D0" />
        </Svg>
      </Animated.View>
    </View>
  );
}

// --- Back-compat aliases used by CalendarScreen -----------------------------
// streak day → orange flame · best day → star · streak+record → blue peak flame
export { FireIcon as AnimatedFireIcon, BestStarIcon as AnimatedStarIcon, PeakFireIcon as AnimatedBurningStarIcon };
