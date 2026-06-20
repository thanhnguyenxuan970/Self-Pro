import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, PanResponder, Dimensions } from 'react-native';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { FontFamily } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';

export interface TargetRect { x: number; y: number; width: number; height: number; }

interface Props {
  visible: boolean;
  rect: TargetRect | null;
  index: number;
  total: number;
  title: string;
  body: string;
  bottomInset: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const PAD = 10;
const GAP = 16;
const TIP_W = 280;
const TIP_H = 160;
const TAB_BAR_H = 62;

export function Coachmark({ visible, rect, index, total, title, body, bottomInset, onNext, onBack, onSkip }: Props) {
  const { colors: C } = useTheme();
  const t = useTranslations();
  const { width: W, height: H } = useWindowDimensions();

  const onNextRef = useRef(onNext);
  const onBackRef = useRef(onBack);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (evt, g) => {
        const w = Dimensions.get('window').width;
        if (Math.abs(g.dx) >= 50) {
          if (g.dx < 0) onNextRef.current();
          else onBackRef.current();
        } else if (Math.abs(g.dy) < 30 && Math.abs(g.dx) < 20) {
          if (evt.nativeEvent.pageX < w / 2) onBackRef.current();
          else onNextRef.current();
        }
      },
    })
  ).current;

  if (!visible) return null;

  const isLast = index >= total - 1;
  const minBottom = TAB_BAR_H + bottomInset + 8;

  let tipTop: number | undefined;
  let tipBottom: number | undefined;
  if (rect) {
    const spaceBelow = H - (rect.y + rect.height) - minBottom - GAP;
    const spaceAbove = rect.y - GAP;
    if (spaceBelow >= TIP_H) {
      // Enough room below → place tip below, clamped so it doesn't hit tab bar
      tipTop = Math.min(rect.y + rect.height + GAP, H - minBottom - TIP_H);
    } else if (spaceAbove >= TIP_H) {
      // Not enough below → place tip above
      tipBottom = Math.max(H - rect.y + GAP, minBottom);
    } else {
      // Element spans most of screen → float tip near top
      tipTop = Math.max(GAP * 2, rect.y - TIP_H - GAP);
    }
  } else {
    tipTop = H / 2 - 90;
  }
  const tipLeft = Math.max(16, Math.min(W - TIP_W - 16, (W - TIP_W) / 2));

  const hx = rect ? rect.x - PAD : 0;
  const hy = rect ? rect.y - PAD : 0;
  const hw = rect ? rect.width + PAD * 2 : 0;
  const hh = rect ? rect.height + PAD * 2 : 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onSkip} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
        <Svg width={W} height={H}>
          <Defs>
            <Mask id="cut">
              <Rect x={0} y={0} width={W} height={H} fill="#ffffff" />
              {rect ? <Rect x={hx} y={hy} width={hw} height={hh} rx={14} fill="#000000" /> : null}
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={W} height={H} fill="rgba(8,16,11,0.76)" mask="url(#cut)" />
          {rect ? (
            <Rect x={hx} y={hy} width={hw} height={hh} rx={14} fill="none" stroke={C.primary} strokeWidth={2.5} />
          ) : null}
        </Svg>
      </View>

      <View
        style={[
          styles.tip,
          { backgroundColor: C.surface, width: TIP_W, left: tipLeft, top: tipTop, bottom: tipBottom },
        ]}
      >
        <Text style={[styles.title, { color: C.inkDark }]}>{title}</Text>
        <Text style={[styles.body, { color: C.muted }]}>{body}</Text>
        <View style={styles.ft}>
          <View style={styles.dots}>
            {Array.from({ length: total }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, { backgroundColor: i === index ? C.primary : C.line2, width: i === index ? 16 : 6 }]}
              />
            ))}
          </View>
          <View style={styles.actions}>
            {index > 0 ? (
              <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
                <Text style={[styles.skip, { color: C.faint }]}>{t.back}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={onSkip} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
                <Text style={[styles.skip, { color: C.faint }]}>{t.tutSkip}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onNext} style={[styles.next, { backgroundColor: C.primary }]} activeOpacity={0.8}>
              <Text style={[styles.nextText, { color: C.white }]}>{isLast ? t.tutDone : t.tutNext}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tip: {
    position: 'absolute',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 10,
  },
  title: { fontSize: 17, fontFamily: FontFamily.bold },
  body: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  ft: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: { height: 6, borderRadius: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skip: { fontSize: 13 },
  next: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  nextText: { fontSize: 13, fontFamily: FontFamily.bold },
});
