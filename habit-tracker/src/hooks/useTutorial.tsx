import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Coachmark, TargetRect } from '../components/Coachmark';
import { useAuthUser } from './useAuth';
import { useTranslations } from './useSettings';

const doneKey = (userId: number) => `habit_tutorial_done_${userId}`;

interface Step { key: string; title: string; body: string; }

interface TutorialCtx {
  targetRef: (key: string) => (node: View | null) => void;
  startIfFirstRun: () => void;
  restart: () => void;
}

const Ctx = createContext<TutorialCtx>({
  targetRef: () => () => {},
  startIfFirstRun: () => {},
  restart: () => {},
});

export const useTutorial = () => useContext(Ctx);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const userId = useAuthUser();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const t = useTranslations();
  const nodes = useRef<Map<string, View>>(new Map());
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

  const measure = useCallback((i: number) => {
    const step = steps[i];
    const node = step ? nodes.current.get(step.key) : undefined;
    if (!node) {
      setRect(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setRect(width || height ? { x, y, width, height } : null);
    });
  }, [steps]);

  useEffect(() => {
    if (!visible) return;
    const task = InteractionManager.runAfterInteractions(() => measure(index));
    return () => task.cancel();
  }, [visible, index, measure]);

  const finish = useCallback(() => {
    setVisible(false);
    AsyncStorage.setItem(doneKey(userId), 'true').catch(() => {});
  }, [userId]);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= steps.length - 1) {
        finish();
        return i;
      }
      return i + 1;
    });
  }, [finish, steps]);

  const back = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const startIfFirstRun = useCallback(async () => {
    const done = await AsyncStorage.getItem(doneKey(userId));
    if (!done) {
      setIndex(0);
      setVisible(true);
    }
  }, [userId]);

  const restart = useCallback(() => {
    setIndex(0);
    setVisible(true);
  }, []);

  return (
    <Ctx.Provider value={{ targetRef, startIfFirstRun, restart }}>
      {children}
      <Coachmark
        visible={visible}
        rect={rect}
        index={index}
        total={steps.length}
        title={steps[index]?.title ?? ''}
        body={steps[index]?.body ?? ''}
        bottomInset={bottomInset}
        onNext={next}
        onBack={back}
        onSkip={finish}
      />
    </Ctx.Provider>
  );
}
