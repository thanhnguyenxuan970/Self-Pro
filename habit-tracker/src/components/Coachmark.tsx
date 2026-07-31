import React, { useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { FontFamily, Shadows } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';

export interface TargetRect { x: number; y: number; width: number; height: number; }

interface Props {
  visible: boolean;
  rect: TargetRect | null;
  index: number;
  total: number;
  title: string;
  body: string;
  roundHighlight: boolean;
  highlightPadding: number;
  bottomInset: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const GAP = 24;
const TIP_W = 280;
const TIP_H = 160;
const TAB_BAR_H = 62;

function computeTipPosition(
  rect: TargetRect | null, H: number, W: number, measuredTipH: number, minBottom: number,
): { tipTop: number | undefined; tipBottom: number | undefined; tipLeft: number } {
  let tipTop: number | undefined;
  let tipBottom: number | undefined;
  if (rect) {
    const spaceBelow = H - (rect.y + rect.height) - minBottom - GAP;
    const spaceAbove = rect.y - GAP;
    if (spaceBelow >= measuredTipH) {
      tipTop = Math.min(rect.y + rect.height + GAP, H - minBottom - measuredTipH);
    } else if (spaceAbove >= measuredTipH) {
      tipTop = Math.max(GAP, rect.y - measuredTipH - GAP);
    } else {
      tipTop = Math.max(GAP * 2, rect.y - measuredTipH - GAP);
    }
  } else {
    tipTop = H / 2 - measuredTipH / 2;
  }
  const tipLeft = Math.max(16, Math.min(W - TIP_W - 16, (W - TIP_W) / 2));
  return { tipTop, tipBottom, tipLeft };
}

function computeHighlightRect(rect: TargetRect | null, padding: number): { hx: number; hy: number; hw: number; hh: number } {
  if (!rect) return { hx: 0, hy: 0, hw: 0, hh: 0 };
  return { hx: rect.x - padding, hy: rect.y - padding, hw: rect.width + padding * 2, hh: rect.height + padding * 2 };
}

export function Coachmark({ visible, rect, index, total, title, body, bottomInset, roundHighlight, highlightPadding, onNext, onBack, onSkip }: Props) {
  const { colors: C } = useTheme();
  const t = useTranslations();
  const reduceMotion = useReduceMotion();
  const { width: W, height: H } = useWindowDimensions();
  const overlayRef = useRef<View>(null);
  const [overlay, setOverlay] = useState({ x: 0, y: 0, width: W, height: H });
  const [measuredTipH, setMeasuredTipH] = useState(TIP_H);
  const handleTipLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setMeasuredTipH(h);
  };

  if (!visible) return null;

  const localRect = rect && {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
  const isLast = index >= total - 1;
  const minBottom = TAB_BAR_H + bottomInset + 8;
  const { tipTop, tipBottom, tipLeft } = computeTipPosition(localRect, overlay.height, overlay.width, measuredTipH, minBottom);

  const { hx, hy, hw, hh } = computeHighlightRect(localRect, highlightPadding);
  const nextLabel = isLast ? t.tutDone : t.tutNext;

  return (
    <Modal visible transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onSkip} statusBarTranslucent navigationBarTranslucent>
      <View
        ref={overlayRef}
        style={StyleSheet.absoluteFill}
        onLayout={() => overlayRef.current?.measureInWindow((x, y, width, height) => setOverlay({ x, y, width, height }))}
      >
      <Svg pointerEvents="none" width={overlay.width} height={overlay.height} style={[StyleSheet.absoluteFill, { zIndex: 0 }]}>
          <Defs>
            <Mask id="cut">
              <Rect x={0} y={0} width={W} height={H} fill="#ffffff" />
              {localRect ? <Rect x={hx} y={hy} width={hw} height={hh} rx={roundHighlight ? hw / 2 : 14} fill="#000000" /> : null}
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={W} height={H} fill={C.scrim} mask="url(#cut)" />
          {localRect ? (
            <Rect x={hx} y={hy} width={hw} height={hh} rx={roundHighlight ? hw / 2 : 14} fill="none" stroke={C.primary} strokeWidth={2.5} />
          ) : null}
      </Svg>

      <View
        onLayout={handleTipLayout}
        accessibilityLiveRegion="polite"
        style={[
          styles.tip,
          { backgroundColor: C.surface, width: TIP_W, left: tipLeft, top: tipTop, bottom: tipBottom },
        ]}
      >
        <Text style={[styles.title, { color: C.inkDark }]}>{title}</Text>
        <Text style={[styles.body, { color: C.ink2 }]}>{body}</Text>
        <View style={styles.ft}>
          <View
            style={styles.dots}
            accessible
            accessibilityLabel={`${index + 1} / ${total}`}
          >
            {Array.from({ length: total }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, { backgroundColor: i === index ? C.primary : C.line2, width: i === index ? 16 : 6 }]}
              />
            ))}
          </View>
          <View style={styles.actions}>
            {index > 0 ? (
              <TouchableOpacity onPress={onBack} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t.back.replace(/^[←→]\s*/, '')}>
                <Text style={[styles.skip, { color: C.ink2 }]}>{t.back}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={onSkip} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t.tutSkip}>
                <Text style={[styles.skip, { color: C.ink2 }]}>{t.tutSkip}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onNext} style={[styles.next, { backgroundColor: C.primary }]} hitSlop={10} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={nextLabel.replace(/\s*[←→]$/, '')}>
              <Text style={[styles.nextText, { color: C.onAccent }]}>{nextLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tip: {
    position: 'absolute',
    zIndex: 1,
    borderRadius: 18,
    padding: 16,
    ...Shadows.hero,
  },
  title: { fontSize: 17, fontFamily: FontFamily.bold },
  body: { fontSize: 13, fontFamily: FontFamily.regular, marginTop: 6, lineHeight: 18 },
  ft: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: { height: 6, borderRadius: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skip: { fontSize: 13, fontFamily: FontFamily.medium },
  next: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  nextText: { fontSize: 13, fontFamily: FontFamily.bold },
});
