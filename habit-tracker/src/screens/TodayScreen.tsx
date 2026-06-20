import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, TextInput, Alert, Animated,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useTodayTasks, useDailySummary, useWeeklySummary,
  useLogTask, useUnlogTask, useTodayLoggedTaskIds, useConsecutiveSuggestions,
  useTodayTaskTotalDurations, PENDING_LEVELUP_KEY,
} from '../queries/useToday';
import { useArchiveTask } from '../queries/useTasks';
import { useRankData } from '../queries/useRank';
import { getCurrentTier } from '../game/tierLookup';
import { Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { Task, TaskRow } from '../components/TaskRow';
import { LevelUpCelebrationModal } from '../components/LevelUpCelebrationModal';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { cueStreakMilestone } from '../audio/uiSounds';
import { useSelectionMode } from '../hooks/useSelectionMode';
import { DAILY_BONUS_THRESHOLD } from '../config/constants';
import { TEMPLATE_NAME_TO_KEY, Strings } from '../config/i18n';
import { useTutorial } from '../hooks/useTutorial';

const RANK_EMOJI: Record<number, string> = { 1: '🎮', 2: '🐣', 3: '🤡', 4: '🌀', 5: '✨', 6: '🔥', 7: '👑' };

function useRankBounceAnimation(rankName: string, reduceMotion: boolean): Animated.Value {
  const anim = useRef(new Animated.Value(1)).current;
  const prevRef = useRef(rankName);
  useEffect(() => {
    if (reduceMotion || prevRef.current === rankName) return;
    prevRef.current = rankName;
    Animated.sequence([
      Animated.spring(anim, { toValue: 1.25, tension: 120, friction: 6, useNativeDriver: true }),
      Animated.spring(anim, { toValue: 1, tension: 120, friction: 6, useNativeDriver: true }),
    ]).start();
  }, [rankName, reduceMotion]);
  return anim;
}

function useStreakPulseAnimation(hasStreak: boolean, reduceMotion: boolean): Animated.Value {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!hasStreak || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.08, duration: 400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasStreak, reduceMotion]);
  return anim;
}

function useProgressBarAnimation(dailyPoints: number): { barWidthAnim: Animated.Value; barGlowOpacity: Animated.Value } {
  const barWidthAnim = useRef(new Animated.Value(Math.min(dailyPoints / DAILY_BONUS_THRESHOLD, 1) * 100)).current;
  const barGlowOpacity = useRef(new Animated.Value(0)).current;
  const prevRef = useRef(dailyPoints);
  useEffect(() => {
    const targetPct = Math.min(dailyPoints / DAILY_BONUS_THRESHOLD, 1) * 100;
    Animated.spring(barWidthAnim, { toValue: targetPct, tension: 100, friction: 8, useNativeDriver: false }).start();
    const prev = prevRef.current;
    const h = DAILY_BONUS_THRESHOLD;
    if ((prev < h / 2 && dailyPoints >= h / 2) || (prev < h && dailyPoints >= h)) {
      barGlowOpacity.setValue(0.7);
      Animated.timing(barGlowOpacity, { toValue: 0, duration: 700, useNativeDriver: false }).start();
    }
    prevRef.current = dailyPoints;
  }, [dailyPoints]);
  return { barWidthAnim, barGlowOpacity };
}

function useHeroNumberPop(value: number, reduceMotion: boolean): Animated.Value {
  const anim = useRef(new Animated.Value(1)).current;
  const prevRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevRef.current === null) { prevRef.current = value; return; }
    if (value > prevRef.current && !reduceMotion) {
      anim.setValue(1.22);
      Animated.spring(anim, { toValue: 1, tension: 180, friction: 7, useNativeDriver: true }).start();
    }
    prevRef.current = value;
  }, [value, reduceMotion]);
  return anim;
}

function SuggestionEntranceWrapper({ index, reduceMotion, children }: { index: number; reduceMotion: boolean; children: React.ReactNode }) {
  const fadeAnim = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(reduceMotion ? 0 : -12)).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.sequence([
      Animated.delay(index * 60),
      Animated.parallel([
        Animated.spring(fadeAnim, { toValue: 1, tension: 180, friction: 14, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 180, friction: 14, useNativeDriver: true }),
      ]),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
      {children}
    </Animated.View>
  );
}

function resolveTaskDisplayName(name: string, t: Strings): string {
  const key = TEMPLATE_NAME_TO_KEY.get(name);
  return key ? ((t as unknown as Record<string, string>)[key] ?? name) : name;
}

function parseLogDuration(duration: string, durationUnit: 'min' | 'hr', errorTitle: string, validDurationMsg: string, maxDurationMsg: string): number | null {
  const parsed = parseInt(duration, 10);
  if (isNaN(parsed) || parsed <= 0) { Alert.alert(errorTitle, validDurationMsg); return null; }
  const mins = durationUnit === 'hr' ? parsed * 60 : parsed;
  if (mins > 1440) { Alert.alert(errorTitle, maxDurationMsg); return null; }
  return mins;
}

type DurationModalLabels = {
  taskDisplayName: string;
  addActivityHowLong: string;
  durationCustom: string;
  unitMin: string;
  unitHour: string;
  logBtn: string;
  cancel: string;
  error: string;
  validDuration: string;
  maxDuration: string;
};

type DurationModalProps = {
  task: Task | null;
  logPending: boolean;
  onLog: (mins: number) => void;
  onClose: () => void;
  colors: AppColors;
  styles: ReturnType<typeof makeStyles>;
  labels: DurationModalLabels;
  reduceMotion: boolean;
};

function DurationModal({ task, logPending, onLog, onClose, colors, styles, labels, reduceMotion }: DurationModalProps) {
  const [duration, setDuration] = useState('');
  const [durationUnit, setDurationUnit] = useState<'min' | 'hr'>('min');
  const [customDuration, setCustomDuration] = useState(false);
  const boxScaleAnim = useRef(new Animated.Value(0.92)).current;
  const boxFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (task) { setDuration(''); setDurationUnit('min'); setCustomDuration(false); }
  }, [task?.id]);

  useEffect(() => {
    if (!task) return;
    if (reduceMotion) { boxScaleAnim.setValue(1); boxFadeAnim.setValue(1); return; }
    boxScaleAnim.setValue(0.92);
    boxFadeAnim.setValue(0);
    Animated.parallel([
      Animated.spring(boxScaleAnim, { toValue: 1, tension: 200, friction: 14, useNativeDriver: true }),
      Animated.spring(boxFadeAnim, { toValue: 1, tension: 200, friction: 14, useNativeDriver: true }),
    ]).start();
  }, [task?.id, reduceMotion]);

  function handleCustomLog() {
    const mins = parseLogDuration(duration, durationUnit, labels.error, labels.validDuration, labels.maxDuration);
    if (mins !== null) onLog(mins);
  }

  return (
    <Modal visible={!!task} transparent animationType="fade">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={styles.modalBg}>
        <Animated.View style={[styles.modalBox, { opacity: boxFadeAnim, transform: [{ scale: boxScaleAnim }] }]}>
          <Text style={styles.modalTitle}>{labels.taskDisplayName}</Text>
          <Text style={styles.modalSub}>{labels.addActivityHowLong}</Text>
          {!customDuration ? (
            <View style={styles.presetChipsRow}>
              {([{ label: '30m', mins: 30 }, { label: '45m', mins: 45 }, { label: '1h', mins: 60 }] as const).map(p => (
                <TouchableOpacity key={p.label} style={styles.presetChip} onPress={() => onLog(p.mins)} disabled={logPending} activeOpacity={0.75}>
                  <Text style={styles.presetChipText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.presetChip, styles.presetChipCustom]} onPress={() => setCustomDuration(true)} activeOpacity={0.75}>
                <Text style={[styles.presetChipText, styles.presetChipCustomText]}>{labels.durationCustom}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.durationRow}>
                <TextInput
                  style={[styles.input, styles.durationInput]}
                  keyboardType="number-pad"
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="0"
                  placeholderTextColor={colors.faint}
                  autoFocus
                />
                <View style={styles.unitToggle}>
                  <TouchableOpacity
                    style={[styles.unitBtn, durationUnit === 'min' && styles.unitBtnActive]}
                    onPress={() => setDurationUnit('min')}
                  >
                    <Text style={[styles.unitBtnText, durationUnit === 'min' && styles.unitBtnTextActive]}>{labels.unitMin}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.unitBtn, durationUnit === 'hr' && styles.unitBtnActive]}
                    onPress={() => setDurationUnit('hr')}
                  >
                    <Text style={[styles.unitBtnText, durationUnit === 'hr' && styles.unitBtnTextActive]}>{labels.unitHour}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity style={styles.btn} onPress={handleCustomLog} disabled={logPending}>
                <Text style={styles.btnText}>{labels.logBtn}</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancel}>{labels.cancel}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FabArrow({ color }: { color: string }) {
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 10, duration: 550, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 550, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [bounce]);
  return (
    <Animated.Text style={{ fontSize: 22, color, marginTop: 18, transform: [{ translateY: bounce }] }}>
      ↓
    </Animated.Text>
  );
}

// fallow-ignore-next-line complexity
export function TodayScreen() {
  const navigation = useNavigation();
  const { userId, googleUser, colors, t, styles } = useScreenCommons(makeStyles);
  const { bottom: bottomInset } = useSafeAreaInsets();

  const { data: tasks, isLoading } = useTodayTasks(userId);
  const { data: daily } = useDailySummary(userId);
  const { data: weekly } = useWeeklySummary(userId);
  const { data: loggedIds } = useTodayLoggedTaskIds(userId);
  const { data: totalDurations } = useTodayTaskTotalDurations(userId);
  const { data: rankData } = useRankData(userId);
  const logTask = useLogTask(userId);
  const unlogTask = useUnlogTask(userId);
  const archiveTask = useArchiveTask(userId);

  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [justLoggedIds, setJustLoggedIds] = useState<Set<number>>(new Set());
  const pendingLogTaskIds = useRef(new Set<number>());
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());
  const [pendingLevelUp, setPendingLevelUp] = useState<{ tierOrder: number; tierName: string } | null>(null);
  const [levelUpChecked, setLevelUpChecked] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PENDING_LEVELUP_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed?.tierOrder === 'number' && typeof parsed?.tierName === 'string') {
            setPendingLevelUp({ tierOrder: parsed.tierOrder, tierName: parsed.tierName });
            setLevelUpChecked(true);
            return;
          }
        } catch {}
      }
      setLevelUpChecked(true);
    }).catch(() => { setLevelUpChecked(true); });
  }, []);

  const { data: suggestions = [] } = useConsecutiveSuggestions(userId);
  const { selectionMode, selectedIds, enterSelection, toggleSelect, selectAll, cancelSelection } = useSelectionMode(tasks ?? []);

  const { targetRef, startIfFirstRun } = useTutorial();
  const taskTutorialRef = useMemo(() => targetRef('task'), [targetRef]);
  const streakTutorialRef = useMemo(() => targetRef('streak'), [targetRef]);
  useEffect(() => {
    if (levelUpChecked && pendingLevelUp === null) startIfFirstRun();
  }, [levelUpChecked, pendingLevelUp, startIfFirstRun]);

  const weeklyStars = weekly?.weekly_stars ?? 0;
  const dailyPoints = daily?.total_points ?? 0;
  const streak = daily?.streak_count ?? 0;
  const isDebt = weeklyStars < 0;
  const currentTier = rankData && rankData.tiers.length > 0 ? getCurrentTier(weeklyStars, rankData.tiers) : null;
  const rankName = currentTier?.rank_name ?? '—';
  const rankEmoji = currentTier ? (RANK_EMOJI[currentTier.tier_order] ?? '⭐') : '⭐';

  const reduceMotion = useReduceMotion();
  const hasStreak = streak > 0;
  const rankBounceAnim = useRankBounceAnimation(rankName, reduceMotion);
  const streakPulseAnim = useStreakPulseAnimation(hasStreak, reduceMotion);
  const { barWidthAnim, barGlowOpacity } = useProgressBarAnimation(dailyPoints);
  const starsPopAnim = useHeroNumberPop(weeklyStars, reduceMotion);

  const avatarInitial = (googleUser?.name?.charAt(0) ?? 'B').toUpperCase();
  const today = new Date();
  const dateStr = `${t.dayNames[today.getDay()]}, ${t.dateStr(today.getDate(), today.getMonth() + 1)}`;

  const displayTasks = useMemo(() => {
    const all = tasks ?? [];
    if (!loggedIds) return all;
    return [...all].sort((a, b) => {
      const aLogged = loggedIds.has(a.id) ? 1 : 0;
      const bLogged = loggedIds.has(b.id) ? 1 : 0;
      if (aLogged !== bLogged) return aLogged - bLogged;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }, [tasks, loggedIds]);

  function showStreakToast(newStreak: number, prevStreak: number) {
    if (newStreak === 1 && prevStreak > 1) {
      Toast.show({ type: 'error', text1: t.streakBreakTitle, text2: t.streakBreakMsg(prevStreak), visibilityTime: 3000 });
    } else if (newStreak > 1 && newStreak > prevStreak) {
      if ([3, 7, 30].includes(newStreak)) cueStreakMilestone();
      Toast.show({ type: 'success', text1: t.streakMilestone(newStreak), visibilityTime: 1800 });
    }
  }

  async function handleLog(task: Task) {
    if (task.is_time_based) {
      setModalTask(task);
      return;
    }
    if (loggedIds?.has(task.id)) {
      try {
        await unlogTask.mutateAsync({ taskTypeId: task.id, kind: task.kind as 'GOOD' | 'BAD' });
      } catch { Alert.alert(t.error, t.cantLog); }
      return;
    }
    if (justLoggedIds.has(task.id) || pendingLogTaskIds.current.has(task.id)) return;
    pendingLogTaskIds.current.add(task.id);
    try {
      const result = await logTask.mutateAsync({
        taskTypeId: task.id, kind: task.kind as 'GOOD' | 'BAD',
        isTimeBased: false, basePoints: task.base_points, starPenalty: task.star_penalty,
      });
      showStreakToast(result.newStreak, result.prevStreak);
      setJustLoggedIds(prev => new Set(prev).add(task.id));
      setTimeout(() => setJustLoggedIds(prev => { const n = new Set(prev); n.delete(task.id); return n; }), 1500);
    } catch { Alert.alert(t.error, t.cantLog); }
    finally { pendingLogTaskIds.current.delete(task.id); }
  }

  async function handleLogTime(mins: number) {
    if (!modalTask) return;
    try {
      const result = await logTask.mutateAsync({
        taskTypeId: modalTask.id, kind: modalTask.kind as 'GOOD' | 'BAD',
        isTimeBased: true, basePoints: modalTask.base_points,
        starPenalty: modalTask.star_penalty, durationMin: mins,
      });
      showStreakToast(result.newStreak, result.prevStreak);
      closeModal();
    } catch { Alert.alert(t.error, t.cantLog); }
  }

  async function handleSuggestionLog(task: { id: number; name: string; kind: string; is_time_based: number; base_points: number; star_penalty: number; icon: string | null }) {
    if (task.is_time_based) {
      setModalTask({ ...task, category_id: null, sort_order: 0 });
      return;
    }
    try {
      const result = await logTask.mutateAsync({
        taskTypeId: task.id, kind: task.kind as 'GOOD' | 'BAD',
        isTimeBased: false, basePoints: task.base_points, starPenalty: task.star_penalty,
      });
      showStreakToast(result.newStreak, result.prevStreak);
      setDismissedSuggestions(prev => new Set(prev).add(task.id));
    } catch { Alert.alert(t.error, t.cantLog); }
  }

  function dismissSuggestion(id: number) {
    setDismissedSuggestions(prev => new Set(prev).add(id));
  }

  function handleDeleteSelected() {
    const ids = Array.from(selectedIds);
    Alert.alert(t.removeTasksTitle, t.hideTasksMsg(ids.length), [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete, style: 'destructive',
        onPress: async () => {
          try {
            for (const id of ids) await archiveTask.mutateAsync(id);
            cancelSelection();
          } catch { Alert.alert(t.error, t.cantLog); }
        },
      },
    ]);
  }

  function closeModal() {
    setModalTask(null);
  }

  if (isLoading) return <View style={{ flex: 1, backgroundColor: colors.bgBase, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LevelUpCelebrationModal
        visible={pendingLevelUp !== null}
        tierOrder={pendingLevelUp?.tierOrder ?? 1}
        tierName={pendingLevelUp?.tierName ?? ''}
        onDismiss={() => {
          setPendingLevelUp(null);
          AsyncStorage.removeItem(PENDING_LEVELUP_KEY).catch(() => {});
        }}
      />
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.avatar} onPress={() => navigation.navigate('Profile' as never)} activeOpacity={0.85} accessibilityLabel={t.openProfile} accessibilityRole="button">
          <Text style={styles.avatarText}>{avatarInitial}</Text>
        </TouchableOpacity>
        <View style={styles.greet}>
          <Text style={styles.hi}>{t.greeting(googleUser?.name?.split(' ').pop() ?? '')}</Text>
          <Text style={styles.date}>{dateStr}</Text>
        </View>
        <TouchableOpacity style={styles.gearBtn} onPress={() => navigation.navigate('Settings' as never)} activeOpacity={0.7} accessibilityLabel={t.openSettings} accessibilityRole="button">
          <Text style={styles.gearIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 + bottomInset }}>
        <LinearGradient
          colors={isDebt ? [colors.dangerPress, colors.danger] : [colors.primaryPress, colors.primary]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroLabel}>{t.heroLabel}</Text>
          <View style={styles.heroBal}>
            <Text style={styles.heroStar}>★</Text>
            <Animated.View style={{ transform: [{ scale: starsPopAnim }] }}>
              <Text style={styles.heroBalNum}>{weeklyStars}</Text>
            </Animated.View>
          </View>
          <View style={styles.heroFoot}>
            <Text style={[styles.heroDelta, isDebt ? styles.heroDeltaDown : styles.heroDeltaUp]}>
              {dailyPoints > 0 ? t.upDelta(dailyPoints) : t.noDelta}
            </Text>
            <Animated.View style={[styles.rankChip, { transform: [{ scale: rankBounceAnim }] }]}>
              <Text style={styles.rankChipText}>{rankEmoji} {rankName}</Text>
            </Animated.View>
          </View>
          {streak > 0 && (
            <Animated.View ref={streakTutorialRef} style={{ alignSelf: 'center', transform: [{ scale: streakPulseAnim }] }}>
              <Text style={styles.heroStreak}>{t.streakChip(streak)}</Text>
            </Animated.View>
          )}
        </LinearGradient>

        <View style={styles.progCard}>
          <View style={styles.progTop}>
            <Text style={styles.progLabel}>{t.pointsLabel}</Text>
            <Text style={styles.progPts}><Text style={styles.progPtsBold}>{dailyPoints}</Text> / {DAILY_BONUS_THRESHOLD}</Text>
          </View>
          <View style={styles.bar}>
            <Animated.View style={[styles.barFill, { width: barWidthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.white, opacity: barGlowOpacity, borderRadius: Radii.pill }]} />
          </View>
          <Text style={styles.progCap}>{t.streakBonus(DAILY_BONUS_THRESHOLD)}</Text>
        </View>

        {!selectionMode && suggestions
          .filter(s => !dismissedSuggestions.has(s.id) && !(loggedIds?.has(s.id)))
          .map((s, index) => (
            <SuggestionEntranceWrapper key={s.id} index={index} reduceMotion={reduceMotion}>
              <View style={styles.suggestionRow}>
                <TouchableOpacity style={styles.suggestionChip} onPress={() => handleSuggestionLog(s)} disabled={logTask.isPending} activeOpacity={0.75} accessibilityRole="button">
                  <Text style={styles.suggestionChipText} numberOfLines={1}>🔄 {t.suggestionPrompt(resolveTaskDisplayName(s.name, t))}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.suggestionDismiss} onPress={() => dismissSuggestion(s.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={t.dismissSuggestion} accessibilityRole="button">
                  <Text style={styles.suggestionDismissText}>✕</Text>
                </TouchableOpacity>
              </View>
            </SuggestionEntranceWrapper>
          ))
        }

        <View style={styles.taskListHeader}>
          <Text style={styles.sectionLabel}>{t.sectionToday}</Text>
          {selectionMode && (
            <View style={styles.selActions}>
              <TouchableOpacity onPress={selectAll} style={styles.selBtn}>
                <Text style={styles.selBtnTxt}>{t.all}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeleteSelected} style={[styles.selBtn, styles.selDeleteBtn]} disabled={selectedIds.size === 0 || archiveTask.isPending}>
                <Text style={styles.selDeleteTxt}>{t.deleteCount(selectedIds.size)}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={cancelSelection} style={styles.selBtn}>
                <Text style={styles.selBtnTxt}>{t.cancel}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <View ref={taskTutorialRef} style={styles.taskCard}>
          {displayTasks.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🎯</Text>
              <Text style={styles.emptyTitle}>{t.emptyTitle}</Text>
              <Text style={styles.emptyDesc}>{t.emptyDesc}</Text>
              <FabArrow color={colors.primary} />
            </View>
          ) : (
            displayTasks.map((item, idx) => {
              const done = loggedIds?.has(item.id) ?? false;
              const isBad = item.kind === 'BAD';
              const isLast = idx === displayTasks.length - 1;
              const isSelected = selectedIds.has(item.id);
              return (
                <TaskRow
                  key={item.id}
                  item={item}
                  done={done}
                  isBad={isBad}
                  isLast={isLast}
                  isSelected={isSelected}
                  selectionMode={selectionMode}
                  justLogged={justLoggedIds.has(item.id)}
                  totalDurationMin={totalDurations?.get(item.id)}
                  onPress={() => selectionMode ? toggleSelect(item.id) : handleLog(item)}
                  onLongPress={() => enterSelection(item.id)}
                  logPending={logTask.isPending || unlogTask.isPending}
                  colors={colors}
                />
              );
            })
          )}
        </View>
      </ScrollView>

      <DurationModal
        task={modalTask}
        logPending={logTask.isPending}
        onLog={handleLogTime}
        onClose={closeModal}
        colors={colors}
        styles={styles}
        reduceMotion={reduceMotion}
        labels={{
          taskDisplayName: modalTask ? resolveTaskDisplayName(modalTask.name, t) : '',
          addActivityHowLong: t.addActivityHowLong,
          durationCustom: t.durationCustom,
          unitMin: t.unitMin,
          unitHour: t.unitHour,
          logBtn: t.logBtn,
          cancel: t.cancel,
          error: t.error,
          validDuration: t.validDuration,
          maxDuration: t.maxDuration,
        }}
      />
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bgBase },

    topbar: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: Spacing.lg, paddingTop: 12, paddingBottom: 2,
    },
    avatar: {
      width: 42, height: 42, borderRadius: 21,
      backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.line,
      justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { fontFamily: FontFamily.extraBold, color: C.primaryPress, fontSize: 16 },
    greet: { flex: 1 },
    hi: { fontSize: 15, fontFamily: FontFamily.extraBold, letterSpacing: -0.2, color: C.inkDark },
    date: { fontSize: 12, color: C.muted, marginTop: 1 },
    gearBtn: { padding: 6 },
    gearIcon: { fontSize: 22 },

    hero: {
      marginHorizontal: Spacing.lg, marginTop: 14,
      borderRadius: Radii.xl, padding: 20, overflow: 'hidden',
      ...Shadows.hero,
    },
    heroLabel: { fontSize: 12, opacity: 0.85, fontFamily: FontFamily.semiBold, letterSpacing: 0.3, color: C.white },
    heroBal: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
    heroStar: { fontSize: 32, color: C.starGold },
    heroBalNum: { fontSize: 40, fontFamily: FontFamily.extraBold, letterSpacing: -1.2, color: C.white, lineHeight: 44 },
    heroFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
    heroDelta: { fontSize: 12, paddingHorizontal: 11, paddingVertical: 5, borderRadius: Radii.pill, fontFamily: FontFamily.bold, overflow: 'hidden' },
    heroDeltaUp: { backgroundColor: 'rgba(255,255,255,0.16)', color: '#B5F0CE' },
    heroDeltaDown: { backgroundColor: 'rgba(255,255,255,0.16)', color: '#FFB9BB' },
    rankChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: Radii.pill,
    },
    rankChipText: { fontSize: 12.5, fontFamily: FontFamily.extraBold, color: C.white },
    heroStreak: {
      color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: FontFamily.semiBold,
      marginTop: 8, alignSelf: 'center', letterSpacing: 0.3,
    },

    progCard: {
      marginHorizontal: Spacing.lg, marginTop: 12,
      backgroundColor: C.surface, borderRadius: Radii.lg,
      padding: 15, borderWidth: 1, borderColor: C.line, ...Shadows.light,
    },
    progTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    progLabel: { fontSize: 13, fontFamily: FontFamily.bold, color: C.inkDark },
    progPts: { fontSize: 13, fontFamily: FontFamily.bold, color: C.inkDark },
    progPtsBold: { fontSize: 16, fontFamily: FontFamily.extraBold, color: C.primary },
    bar: {
      height: 10, backgroundColor: C.surface2, borderRadius: Radii.pill,
      marginTop: 10, overflow: 'hidden',
    },
    barFill: { height: '100%', backgroundColor: C.primary, borderRadius: Radii.pill },
    progCap: { fontSize: 11.5, color: C.muted, marginTop: 8 },

    sectionLabel: {
      fontSize: 12, fontFamily: FontFamily.semiBold, color: C.ink2,
      marginHorizontal: Spacing.lg, marginTop: 20, marginBottom: 9,
    },
    taskListHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    selActions: { flexDirection: 'row', gap: 8, marginRight: Spacing.lg, marginTop: 20 },
    selBtn: {
      paddingHorizontal: 10, paddingVertical: 5,
      backgroundColor: C.surface2, borderRadius: Radii.sm,
      borderWidth: 1, borderColor: C.line2,
    },
    selBtnTxt: { fontSize: 12, fontFamily: FontFamily.bold, color: C.inkDark },
    selDeleteBtn: { borderColor: C.danger, backgroundColor: C.dangerSoft },
    selDeleteTxt: { fontSize: 12, fontFamily: FontFamily.bold, color: C.danger },

    taskCard: {
      marginHorizontal: Spacing.lg,
      backgroundColor: C.surface, borderRadius: Radii.lg,
      borderWidth: 1, borderColor: C.line, ...Shadows.light,
      paddingHorizontal: 15,
    },
    suggestionRow: {
      flexDirection: 'row', alignItems: 'center',
      marginHorizontal: Spacing.lg, marginBottom: 6,
    },
    suggestionChip: {
      flex: 1, backgroundColor: C.surface, borderRadius: Radii.pill,
      paddingVertical: 8, paddingHorizontal: 14,
      borderWidth: 1, borderColor: C.primary + '55', ...Shadows.light,
    },
    suggestionChipText: { color: C.primary, fontSize: 13, fontFamily: FontFamily.semiBold },
    suggestionDismiss: { marginLeft: 8, padding: 4 },
    suggestionDismissText: { color: C.faint, fontSize: 14, fontFamily: FontFamily.bold },

    empty: { padding: 36, paddingHorizontal: 12, alignItems: 'center' },
    emptyEmoji: { fontSize: 42, marginBottom: 8, opacity: 0.6 },
    emptyTitle: { fontSize: 14, fontFamily: FontFamily.bold, color: C.ink2 },
    emptyDesc: { fontSize: 12, color: C.muted, marginTop: 4 },

    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: Spacing.lg },
    modalBox: {
      backgroundColor: C.surface, padding: Spacing.xl,
      borderRadius: Radii.xl,
    },
    modalTitle: { fontSize: 19, fontFamily: FontFamily.extraBold, color: C.inkDark, marginBottom: 4 },
    modalSub: { fontSize: 13, color: C.muted, marginBottom: Spacing.md },
    presetChipsRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.md, flexWrap: 'wrap' },
    presetChip: {
      flex: 1, minWidth: 60, backgroundColor: C.primary,
      borderRadius: Radii.md, paddingVertical: 16,
      alignItems: 'center', justifyContent: 'center',
    },
    presetChipCustom: { backgroundColor: C.surface2, borderWidth: 1.5, borderColor: C.line2 },
    presetChipText: { color: C.white, fontSize: 16, fontFamily: FontFamily.extraBold },
    presetChipCustomText: { color: C.inkDark },
    durationRow: {
      flexDirection: 'row', alignItems: 'stretch', gap: 10, marginBottom: Spacing.md,
    },
    input: {
      backgroundColor: C.surface2, color: C.inkDark, padding: 13,
      borderRadius: Radii.md, fontSize: 14,
      borderWidth: 1.5, borderColor: C.line2,
    },
    durationInput: { flex: 1, fontSize: 22, fontFamily: FontFamily.bold, textAlign: 'center' },
    unitToggle: {
      flexDirection: 'column', borderRadius: Radii.md, overflow: 'hidden',
      borderWidth: 1.5, borderColor: C.line2,
    },
    unitBtn: {
      flex: 1, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center',
      backgroundColor: C.surface2,
    },
    unitBtnActive: { backgroundColor: C.primary },
    unitBtnText: { fontSize: 13, fontFamily: FontFamily.bold, color: C.muted },
    unitBtnTextActive: { color: C.white },
    btn: { backgroundColor: C.primary, padding: 15, borderRadius: Radii.md, alignItems: 'center', marginBottom: 8 },
    btnText: { color: C.white, fontSize: 15, fontFamily: FontFamily.bold },
    cancel: { textAlign: 'center', color: C.muted, padding: 8 },
  });
}
