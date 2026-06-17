import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Coachmark, TargetRect } from '../components/Coachmark';

const DONE_KEY = 'habit_tutorial_done';

interface Step { key: string; title: string; body: string; }

// Each step points at a registered target key. Steps 2 & 3 reuse the same
// task row with different copy. Keep copy to 1 idea + 1 short line.
const STEPS: Step[] = [
  { key: 'fab',       title: 'Thêm hoạt động ✨', body: 'Bấm + để tạo thói quen bạn muốn theo dõi.' },
  { key: 'task',      title: 'Làm xong? Chạm để +1 ⭐', body: 'Mỗi việc hoàn thành cộng sao cho bạn.' },
  { key: 'task',      title: '⏳ 30 phút = 1 ⭐', body: 'Thời gian là vàng. Làm càng lâu, sao càng nhiều.' },
  { key: 'streak',    title: '🔥 Giữ streak', body: 'Đủ điểm mỗi ngày để chuỗi không bị đứt.' },
  { key: 'analytics', title: '📊 Soi tiến bộ', body: 'Xem biểu đồ & lịch sử của bạn.' },
  { key: 'rank',      title: '🏆 Leo top', body: 'So tài với cộng đồng, reset mỗi thứ 2.' },
];

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
  const nodes = useRef<Map<string, View>>(new Map());
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);

  const targetRef = useCallback(
    (key: string) => (node: View | null) => {
      if (node) nodes.current.set(key, node);
      else nodes.current.delete(key);
    },
    [],
  );

  const measure = useCallback((i: number) => {
    const step = STEPS[i];
    const node = step ? nodes.current.get(step.key) : undefined;
    if (!node) {
      setRect(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setRect(width || height ? { x, y, width, height } : null);
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => measure(index), 80);
    return () => clearTimeout(id);
  }, [visible, index, measure]);

  const finish = useCallback(() => {
    setVisible(false);
    AsyncStorage.setItem(DONE_KEY, 'true').catch(() => {});
  }, []);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= STEPS.length - 1) {
        finish();
        return i;
      }
      return i + 1;
    });
  }, [finish]);

  const startIfFirstRun = useCallback(async () => {
    const done = await AsyncStorage.getItem(DONE_KEY);
    if (!done) {
      setIndex(0);
      setVisible(true);
    }
  }, []);

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
        total={STEPS.length}
        title={STEPS[index]?.title ?? ''}
        body={STEPS[index]?.body ?? ''}
        onNext={next}
        onSkip={finish}
      />
    </Ctx.Provider>
  );
}
