import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Coachmark, TargetRect } from '../components/Coachmark';
import { Spacing } from '../config/theme';
import { useAuthUser } from './useAuth';
import { useTranslations } from './useSettings';

const doneKey = (userId: number) => `habit_tutorial_done_${userId}`;
const DEFAULT_HIGHLIGHT_PADDING = 10;

interface Step { key: string; title: string; body: string; }

interface TutorialCtx {
  targetRef: (key: string) => (node: View | null) => void;
  startIfFirstRun: () => void;
  restart: () => void;
  activeKey: string | null;
  refreshTarget: () => void;
}

const Ctx = createContext<TutorialCtx>({
  targetRef: () => () => {},
  startIfFirstRun: () => {},
  restart: () => {},
  activeKey: null,
  refreshTarget: () => {},
});

export const useTutorial = () => useContext(Ctx);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const userId = useAuthUser();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();
  const t = useTranslations();
  const nodes = useRef<Map<string, View>>(new Map());
  const rects = useRef<Map<string, TargetRect>>(new Map());
  const indexRef = useRef(0);
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);

  const steps = useMemo<Step[]>(() => [
    { key: 'fab',       title: t.tutStep0Title, body: t.tutStep0Body },
    { key: 'task',      title: t.tutStep1Title, body: t.tutStep1Body },
    { key: 'task',      title: t.tutStep2Title, body: t.tutStep2Body },
    { key: 'streak',    title: t.tutStep3Title, body: t.tutStep3Body },
    { key: 'analytics', title: t.tutStep4Title, body: t.tutStep4Body },
    { key: 'rank',      title: t.tutStep5Title, body: t.tutStep5Body },
  ], [t]);

  const targetRef = useCallback(
    (key: string) => (node: View | null) => {
      if (node) nodes.current.set(key, node);
      else nodes.current.delete(key);
    },
    [],
  );

  const measure = useCallback((i: number, apply = true) => {
    const step = steps[i];
    const node = step ? nodes.current.get(step.key) : undefined;
    if (!node) {
      if (apply) setRect(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (apply && indexRef.current !== i) return;
      if (step.key === 'task') {
        const nextRect = { x: x + 12, y: y + 48, width: Math.max(0, width - 24), height: 64 };
        rects.current.set(step.key, nextRect);
        if (apply) setRect(nextRect);
        return;
      }
      if (step.key === 'analytics' || step.key === 'rank') {
        const nextRect = { x: x - 10, y: y + 36, width: width + 20, height: 62 };
        rects.current.set(step.key, nextRect);
        if (apply) setRect(nextRect);
        return;
      }
      // The streak pill lives in the SafeAreaView content, while Coachmark's
      // translucent Modal is rooted at the full display. Keep that target in
      // the same coordinate space without affecting the task-row offset.
      const offsetY = step.key === 'streak'
        ? topInset + Spacing.sm
        : (step.key === 'fab' ? 18.5 * PixelRatio.get() : 0);
      const nextRect = width || height ? { x, y: y + offsetY, width, height } : null;
      if (nextRect) rects.current.set(step.key, nextRect);
      if (apply) setRect(nextRect);
    });
  }, [steps, topInset]);

  useEffect(() => {
    if (!visible) return;
    rects.current.clear();
    const frame = requestAnimationFrame(() => {
      measure(index);
      steps.forEach((step, stepIndex) => {
        if (stepIndex !== index && !rects.current.has(step.key)) measure(stepIndex, false);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [fontScale, index, measure, steps, visible, windowHeight, windowWidth]);

  const goTo = useCallback((nextIndex: number) => {
    indexRef.current = nextIndex;
    setIndex(nextIndex);
    const nextKey = steps[nextIndex]?.key;
    setRect(null);
    if (nextKey === 'task' || nextKey === 'streak') return;
    const nextRect = rects.current.get(steps[nextIndex]?.key);
    if (nextRect) setRect(nextRect);
    else measure(nextIndex);
  }, [measure, steps]);

  const refreshTarget = useCallback(() => {
    if (!visible) return;
    const currentStep = indexRef.current;
    rects.current.delete(steps[currentStep]?.key ?? '');
    measure(currentStep);
  }, [measure, steps, visible]);

  const finish = useCallback(() => {
    setVisible(false);
    AsyncStorage.setItem(doneKey(userId), 'true').catch(() => {});
  }, [userId]);

  const next = useCallback(() => {
    if (indexRef.current >= steps.length - 1) finish();
    else goTo(indexRef.current + 1);
  }, [finish, goTo, steps.length]);

  const back = useCallback(() => {
    goTo(Math.max(0, indexRef.current - 1));
  }, [goTo]);

  const startIfFirstRun = useCallback(async () => {
    const done = await AsyncStorage.getItem(doneKey(userId));
    if (!done) {
      setRect(null);
      indexRef.current = 0;
      setIndex(0);
      setVisible(true);
    }
  }, [userId]);

  const restart = useCallback(() => {
    setRect(null);
    indexRef.current = 0;
    setIndex(0);
    setVisible(true);
  }, []);

  return (
    <Ctx.Provider value={{ targetRef, startIfFirstRun, restart, activeKey: visible ? steps[index]?.key ?? null : null, refreshTarget }}>
      {children}
      <Coachmark
        visible={visible}
        rect={rect}
        index={index}
        total={steps.length}
        title={steps[index]?.title ?? ''}
        body={steps[index]?.body ?? ''}
        roundHighlight={steps[index]?.key === 'fab'}
        highlightPadding={steps[index]?.key === 'fab' || steps[index]?.key === 'task' ? 4 : (steps[index]?.key === 'analytics' || steps[index]?.key === 'rank' ? 4 : DEFAULT_HIGHLIGHT_PADDING)}
        topInset={topInset}
        bottomInset={bottomInset}
        onNext={next}
        onBack={back}
        onSkip={finish}
      />
    </Ctx.Provider>
  );
}
