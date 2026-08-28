import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { FontFamily, Shadows } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import {
  COACHMARK_FALLBACK_HEIGHT,
  getCoachmarkPosition,
} from '../utils/coachmarkLayout';

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
  topInset: number;
  bottomInset: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

function computeHighlightRect(rect: TargetRect | null, padding: number): { hx: number; hy: number; hw: number; hh: number } {
  if (!rect) return { hx: 0, hy: 0, hw: 0, hh: 0 };
  return { hx: rect.x - padding, hy: rect.y - padding, hw: rect.width + padding * 2, hh: rect.height + padding * 2 };
}

export function Coachmark({ visible, rect, index, total, title, body, bottomInset, topInset, roundHighlight, highlightPadding, onNext, onBack, onSkip }: Props) {
  const { colors: C } = useTheme();
  const t = useTranslations();
  const reduceMotion = useReduceMotion();
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();
  const overlayRef = useRef<View>(null);
  const [overlay, setOverlay] = useState({ x: 0, y: 0, width: windowWidth, height: windowHeight });
  const [measuredTipH, setMeasuredTipH] = useState(COACHMARK_FALLBACK_HEIGHT);

  useEffect(() => {
    setOverlay(previous => ({ ...previous, width: windowWidth, height: windowHeight }));
  }, [windowHeight, windowWidth]);

  useEffect(() => {
    setMeasuredTipH(COACHMARK_FALLBACK_HEIGHT);
  }, [body, title, windowWidth]);

  const handleTipLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setMeasuredTipH(h);
  };

  if (!visible) return null;

  const overlayWidth = overlay.width || windowWidth;
  const overlayHeight = overlay.height || windowHeight;
  const localRect = rect && {
    x: rect.x - overlay.x,
    y: rect.y - overlay.y,
    width: rect.width,
    height: rect.height,
  };
  const isLast = index >= total - 1;
  const { tipTop, tipLeft, tipWidth } = getCoachmarkPosition(localRect, overlayWidth, overlayHeight, measuredTipH, topInset, bottomInset);
  const compactFooter = overlayWidth < 360 || fontScale > 1.15;

  const { hx, hy, hw, hh } = computeHighlightRect(localRect, highlightPadding);
  const nextLabel = isLast ? t.tutDone : t.tutNext;

  return (
    <Modal visible transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onSkip} statusBarTranslucent navigationBarTranslucent>
      <View
        ref={overlayRef}
        style={StyleSheet.absoluteFill}
        onLayout={() => overlayRef.current?.measureInWindow((x, y, width, height) => setOverlay({ x, y, width, height }))}
      >
      <Svg pointerEvents="none" width={overlayWidth} height={overlayHeight} style={[StyleSheet.absoluteFill, { zIndex: 0 }]}>
          <Defs>
            <Mask id="cut">
              <Rect x={0} y={0} width={overlayWidth} height={overlayHeight} fill="#ffffff" />
              {localRect ? <Rect x={hx} y={hy} width={hw} height={hh} rx={roundHighlight ? hw / 2 : 14} fill="#000000" /> : null}
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={overlayWidth} height={overlayHeight} fill={C.scrim} mask="url(#cut)" />
          {localRect ? (
            <Rect x={hx} y={hy} width={hw} height={hh} rx={roundHighlight ? hw / 2 : 14} fill="none" stroke={C.primary} strokeWidth={2.5} />
          ) : null}
      </Svg>

      <View
        onLayout={handleTipLayout}
        accessibilityLiveRegion="polite"
        style={[
          styles.tip,
          { backgroundColor: C.surface, width: tipWidth, left: tipLeft, top: tipTop },
        ]}
      >
        <Text style={[styles.title, { color: C.inkDark }]}>{title}</Text>
        <Text style={[styles.body, { color: C.ink2 }]}>{body}</Text>
        <View style={[styles.ft, compactFooter && styles.ftCompact]}>
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
              <TouchableOpacity style={styles.actionButton} onPress={onBack} hitSlop={4} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t.back.replace(/^[←→]\s*/, '')}>
                <Text style={[styles.skip, { color: C.ink2 }]}>{t.back}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.actionButton} onPress={onSkip} hitSlop={4} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t.tutSkip}>
                <Text style={[styles.skip, { color: C.ink2 }]}>{t.tutSkip}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onNext} style={[styles.next, { backgroundColor: C.primary }]} hitSlop={4} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={nextLabel.replace(/\s*[←→]$/, '')}>
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
    maxWidth: '100%',
    ...Shadows.hero,
  },
  title: { fontSize: 17, lineHeight: 22, fontFamily: FontFamily.bold, maxWidth: '100%' },
  body: { fontSize: 13, fontFamily: FontFamily.regular, marginTop: 6, lineHeight: 18, maxWidth: '100%', flexShrink: 1 },
  ft: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 8 },
  ftCompact: { flexDirection: 'column', alignItems: 'stretch', gap: 6 },
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center', flexShrink: 1 },
  dot: { height: 6, borderRadius: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-end' },
  actionButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  skip: { fontSize: 13, lineHeight: 18, fontFamily: FontFamily.medium },
  next: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  nextText: { fontSize: 13, fontFamily: FontFamily.bold },
});
