import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, Alert, Animated,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useTodayTasks, useDailySummary, useWeeklySummary,
  useLogTask, useUnlogTask, useTodayLoggedTaskIds, useConsecutiveSuggestions,
  useTodayTaskTotalDurations, PENDING_LEVELUP_KEY,
} from '../queries/useToday';
import { rankMascotBridge } from '../lib/rankMascotBridge';
import { useArchiveTask, useUpdateTaskName } from '../queries/useTasks';
import { useRankData } from '../queries/useRank';
import { Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { Task, TaskRow } from '../components/TaskRow';
import { SkeletonRow } from '../components/SkeletonRow';
import { LevelUpCelebrationModal } from '../components/LevelUpCelebrationModal';
import { StreakMilestoneCelebrationModal } from '../components/StreakMilestoneCelebrationModal';
import { EditActivityModal } from '../components/EditActivityModal';
import { ShareCardModal } from './ShareCardModal';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { cueStreakMilestone } from '../audio/uiSounds';
import { useSelectionMode } from '../hooks/useSelectionMode';
import { DAILY_BONUS_THRESHOLD } from '../config/constants';
import { useTutorial } from '../hooks/useTutorial';
import { resolveTaskDisplayName } from '../utils/resolveTaskDisplayName';
import { useShareCardData, tierPercentile } from '../hooks/useShareCardData';
import { useNewsFeed } from '../queries/useNews';
import { getNewsViewerKey } from '../utils/news';
import { useHeatmapData } from '../queries/useCalendar';
import { useBackfillStatus } from '../queries/useBackfillStatus';
import { HomeHeatmap } from '../components/HomeHeatmap';
import { HomeBackfillNudge } from '../components/HomeBackfillNudge';
import { BackfillFlow } from '../components/BackfillFlow';
import { DurationClockInput } from '../components/DurationClockInput';
import { DurationPresetChips } from '../components/DurationPresetChips';
import { clockMinutes } from '../utils/durationClock';
import { getHomeBackfillNudge } from '../game/homeBackfillNudge';
import { getLocalDate, getWeekStart } from '../utils/formatters';
import type { StreakMilestone } from '../game/streakMilestones';

const RANK_EMOJI: Record<number, string> = { 1: '🎮', 2: '🐣', 3: '🤡', 4: '🌀', 5: '✨', 6: '🔥', 7: '👑', 8: '👾', 9: '😇' };
const SHARE_MILESTONES = [7, 30, 90];

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

type DurationModalLabels = {
  taskDisplayName: string;
  addActivityHowLong: string;
  durationCustom: string;
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
  const [clock, setClock] = useState({ hours: 0, minutes: 0 });
  const [customDuration, setCustomDuration] = useState(false);
  const boxScaleAnim = useRef(new Animated.Value(0.92)).current;
  const boxFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (task) { setClock({ hours: 0, minutes: 0 }); setCustomDuration(false); }
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
    const mins = clockMinutes(clock);
    if (mins <= 0) { Alert.alert(labels.error, labels.validDuration); return; }
    if (mins > 1440) { Alert.alert(labels.error, labels.maxDuration); return; }
    onLog(mins);
  }

  return (
    <Modal visible={!!task} transparent animationType="fade">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.modalBg}>
        <Animated.View style={[styles.modalBox, { opacity: boxFadeAnim, transform: [{ scale: boxScaleAnim }] }]}>
          <Text style={styles.modalTitle}>{labels.taskDisplayName}</Text>
          <Text style={styles.modalSub}>{labels.addActivityHowLong}</Text>
          {!customDuration ? (
            <DurationPresetChips
              colors={colors}
              disabled={logPending}
              onSelectPreset={onLog}
              onCustom={() => setCustomDuration(true)}
              customLabel={labels.durationCustom}
            />
          ) : (
            <>
              <DurationClockInput value={clock} onChange={setClock} colors={colors} />
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

function FabArrow({ color, reduceMotion }: { color: string; reduceMotion: boolean }) {
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 10, duration: 550, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 550, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [bounce, reduceMotion]);
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
  const { data: heatmapDays = [] } = useHeatmapData(userId);
  const { data: backfillStatus } = useBackfillStatus(userId);
  const logTask = useLogTask(userId);
  const unlogTask = useUnlogTask(userId);
  const archiveTask = useArchiveTask(userId);
  const updateTaskName = useUpdateTaskName(userId);

  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [justLoggedIds, setJustLoggedIds] = useState<Set<number>>(new Set());
  const pendingLogTaskIds = useRef(new Set<number>());
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());
  const [pendingLevelUp, setPendingLevelUp] = useState<{ tierOrder: number; tierName: string } | null>(null);
  const [pendingStreakMilestone, setPendingStreakMilestone] = useState<StreakMilestone | null>(null);
  const [levelUpChecked, setLevelUpChecked] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [showScoringGuide, setShowScoringGuide] = useState(false);
  const [backfillDate, setBackfillDate] = useState<string | null>(null);
  const [backfillNudgeDismissed, setBackfillNudgeDismissed] = useState(false);

  const { data: shareCardData } = useShareCardData(userId);

  useEffect(() => {
    rankMascotBridge.onRankUp = (rank) => setPendingLevelUp({ tierOrder: rank.tier_order, tierName: rank.rank_name });
    return () => { rankMascotBridge.onRankUp = null; };
  }, []);

  useEffect(() => {
    if (!rankData?.promotion) return;
    const next = { tierOrder: rankData.promotion.tier_order, tierName: rankData.promotion.rank_name };
    setPendingLevelUp(next);
    AsyncStorage.setItem(PENDING_LEVELUP_KEY, JSON.stringify(next)).catch(() => {});
  }, [rankData?.promotion]);

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
  const currentTier = rankData?.currentTierId
    ? rankData.tiers.find(t => t.id === rankData.currentTierId) ?? null
    : null;
  const rankName = currentTier?.rank_name ?? '—';
  const rankDisplayName = currentTier ? (t.rankNameMap[rankName] ?? rankName) : t.noRankTitle;
  const rankEmoji = currentTier ? (RANK_EMOJI[currentTier.tier_order] ?? '⭐') : '⭐';
  const percentile = tierPercentile(currentTier?.tier_order ?? 1);
  const newsViewerKey = getNewsViewerKey(googleUser?.sub);
  const { unreadCount: unreadNewsCount } = useNewsFeed(newsViewerKey);

  const reduceMotion = useReduceMotion();

  const backfillNudgeKey = `backfillNudgeDismissed:${getLocalDate()}`;
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(backfillNudgeKey).then(value => {
      if (active) setBackfillNudgeDismissed(value === 'true');
    }).catch(() => {});
    return () => { active = false; };
  }, [backfillNudgeKey]);

  const backfillNudge = useMemo(() => getHomeBackfillNudge({
    today: getLocalDate(),
    weekStart: getWeekStart(),
    activeDates: heatmapDays.map(day => day.local_date),
    freezeDates: backfillStatus?.freezeDates ?? new Set<string>(),
    backfillsUsedThisWeek: backfillStatus?.backfillsUsedThisWeek ?? 0,
  }), [backfillStatus, heatmapDays]);

  function dismissBackfillNudge() {
    setBackfillNudgeDismissed(true);
    AsyncStorage.setItem(backfillNudgeKey, 'true').catch(() => {});
  }

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

  const showStreakToast = useCallback((newStreak: number, prevStreak: number, milestone: StreakMilestone | null) => {
    if (newStreak === 1 && prevStreak > 1) {
      Toast.show({ type: 'error', text1: t.streakBreakTitle, text2: t.streakBreakMsg(prevStreak), visibilityTime: 3000 });
    } else if (newStreak > 1 && newStreak > prevStreak) {
      if (milestone) {
        cueStreakMilestone();
        setPendingStreakMilestone(milestone);
      } else {
        Toast.show({ type: 'success', text1: t.streakMilestone(newStreak), visibilityTime: 1800 });
      }
      if (!milestone && SHARE_MILESTONES.includes(newStreak)) {
        setTimeout(() => setShowShareCard(true), 1500);
      }
    }
  }, [t]);

  const tryUnlog = useCallback(async (task: Task) => {
    try {
      await unlogTask.mutateAsync({ taskTypeId: task.id, kind: task.kind as 'GOOD' | 'BAD' });
    } catch { Alert.alert(t.error, t.cantLog); }
  }, [unlogTask, t]);

  const logNonTimedTask = useCallback(async (task: { id: number; kind: string; base_points: number; star_penalty: number }) => {
    const result = await logTask.mutateAsync({
      taskTypeId: task.id, kind: task.kind as 'GOOD' | 'BAD',
      isTimeBased: false, basePoints: task.base_points, starPenalty: task.star_penalty,
    });
    showStreakToast(result.newStreak, result.prevStreak, result.milestone);
    return result;
  }, [logTask, showStreakToast]);

  const handleLog = useCallback(async (task: Task) => {
    if (loggedIds?.has(task.id)) {
      await tryUnlog(task);
      return;
    }
    if (task.is_time_based) {
      setModalTask(task);
      return;
    }
    if (justLoggedIds.has(task.id) || pendingLogTaskIds.current.has(task.id)) return;
    pendingLogTaskIds.current.add(task.id);
    try {
      await logNonTimedTask(task);
      setJustLoggedIds(prev => new Set(prev).add(task.id));
      setTimeout(() => setJustLoggedIds(prev => { const n = new Set(prev); n.delete(task.id); return n; }), 1500);
    } catch { Alert.alert(t.error, t.cantLog); }
    finally { pendingLogTaskIds.current.delete(task.id); }
  }, [loggedIds, justLoggedIds, tryUnlog, logNonTimedTask, t]);

  const handleTaskPress = useCallback((task: Task) => {
    if (selectionMode) toggleSelect(task.id);
    else handleLog(task);
  }, [selectionMode, toggleSelect, handleLog]);

  const handleTaskLongPress = useCallback((task: Task) => {
    enterSelection(task.id);
  }, [enterSelection]);

  async function handleLogTime(mins: number) {
    if (!modalTask) return;
    try {
      const result = await logTask.mutateAsync({
        taskTypeId: modalTask.id, kind: modalTask.kind as 'GOOD' | 'BAD',
        isTimeBased: true, basePoints: modalTask.base_points,
        starPenalty: modalTask.star_penalty, durationMin: mins,
      });
      showStreakToast(result.newStreak, result.prevStreak, result.milestone);
      closeModal();
    } catch { Alert.alert(t.error, t.cantLog); }
  }

  async function handleSuggestionLog(task: { id: number; name: string; kind: string; is_time_based: number; base_points: number; star_penalty: number; icon: string | null }) {
    if (task.is_time_based) {
      setModalTask({ ...task, category_id: null, sort_order: 0, is_template: 0 });
      return;
    }
    try {
      await logNonTimedTask(task);
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

  async function handleEditSave(taskId: number, name: string, isTimeBased: boolean, newDurationMin: number | null) {
    const task = editTask;
    setEditTask(null);
    if (!task) return;
    try {
      await updateTaskName.mutateAsync({ taskId, name, isTimeBased });
      if (newDurationMin !== null && isTimeBased) {
        const currentMin = totalDurations?.get(taskId)?.duration ?? 0;
        if (newDurationMin !== currentMin) {
          await unlogTask.mutateAsync({ taskTypeId: taskId, kind: task.kind as 'GOOD' | 'BAD' });
          if (newDurationMin > 0) {
            await logTask.mutateAsync({
              taskTypeId: taskId, kind: task.kind as 'GOOD' | 'BAD',
              isTimeBased: true, basePoints: task.base_points,
              starPenalty: task.star_penalty, durationMin: newDurationMin,
            });
          }
        }
      }
    } catch { Alert.alert(t.error, t.cantLog); }
  }

  if (isLoading) return (
    <View style={{ flex: 1, backgroundColor: colors.bgBase, paddingTop: Spacing.xl }}>
      <SkeletonRow colors={colors} />
      <SkeletonRow colors={colors} />
      <SkeletonRow colors={colors} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <EditActivityModal
        visible={editTask !== null}
        task={editTask}
        totalDurationMin={editTask ? totalDurations?.get(editTask.id)?.duration : undefined}
        onSave={handleEditSave}
        onClose={() => setEditTask(null)}
      />
      <LevelUpCelebrationModal
        visible={pendingLevelUp !== null}
        tierOrder={pendingLevelUp?.tierOrder ?? 1}
        tierName={t.rankNameMap[pendingLevelUp?.tierName ?? ''] ?? pendingLevelUp?.tierName ?? ''}
        weeklyStars={weeklyStars}
        onDismiss={() => {
          setPendingLevelUp(null);
          AsyncStorage.removeItem(PENDING_LEVELUP_KEY).catch(() => {});
        }}
      />
      <ShareCardModal
        visible={showShareCard}
        onClose={() => setShowShareCard(false)}
        streakCount={streak}
        daysDone={shareCardData?.daysDone ?? 0}
        percentile={percentile}
        topHabitName={shareCardData?.topHabitName ?? ''}
        weeklyStars={weeklyStars}
        tierName={rankDisplayName}
      />
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.avatar} onPress={() => navigation.navigate('Profile' as never)} activeOpacity={0.85} hitSlop={3} accessibilityLabel={t.openProfile} accessibilityRole="button">
          <Text style={styles.avatarText}>{avatarInitial}</Text>
        </TouchableOpacity>
        <View style={styles.greet}>
          <Text style={styles.date} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{dateStr.toUpperCase()}</Text>
          <Text style={styles.hi} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t.greeting(googleUser?.name?.split(' ').pop() ?? '')}</Text>
        </View>
        <View style={styles.topbarActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('News' as never)}
            activeOpacity={0.7}
            accessibilityLabel={t.openNews}
            accessibilityRole="button"
          >
            <Text style={styles.iconGlyph}>🔔</Text>
            {unreadNewsCount > 0 ? <View style={styles.newsDot} /> : null}
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Settings' as never)} activeOpacity={0.7} accessibilityLabel={t.openSettings} accessibilityRole="button">
            <Text style={styles.iconGlyph}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 + bottomInset }}>
        <HomeHeatmap days={heatmapDays} streak={streak} goal={DAILY_BONUS_THRESHOLD} colors={colors} todayPoints={dailyPoints} rankEmoji={rankEmoji} weeklyStars={weeklyStars} rankName={rankDisplayName} streakRef={streakTutorialRef} scoringGuideVisible={showScoringGuide} onScoringGuideClose={() => setShowScoringGuide(false)} />

        {!backfillNudgeDismissed && <HomeBackfillNudge
          nudge={backfillNudge}
          activeDates={heatmapDays.map(day => day.local_date)}
          today={getLocalDate()}
          weekStart={getWeekStart()}
          colors={colors}
          t={t}
          onDismiss={dismissBackfillNudge}
          onDatePress={setBackfillDate}
          opensCalendar={backfillNudge.pendingDates.length > 1}
          onPress={() => backfillNudge.pendingDates.length === 1
            ? setBackfillDate(backfillNudge.pendingDates[0])
            : navigation.navigate('Calendar' as never)}
        />}

        <TouchableOpacity
          style={styles.challengeEntryCard}
          onPress={() => navigation.navigate('ChallengeHub' as never)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t.challengeHomeCard}
        >
          <Text style={styles.challengeEntryIcon}>🎯</Text>
          <Text style={styles.challengeEntryText}>{t.challengeHomeCard}</Text>
          <Text style={styles.challengeEntryArrow}>→</Text>
        </TouchableOpacity>

        {!selectionMode && suggestions
          .filter(s => !dismissedSuggestions.has(s.id) && !(loggedIds?.has(s.id)))
          .map((s, index) => (
            <SuggestionEntranceWrapper key={s.id} index={index} reduceMotion={reduceMotion}>
              <View style={[styles.suggestionRow, index === 0 && styles.suggestionRowFirst]}>
                <TouchableOpacity style={styles.suggestionChip} onPress={() => handleSuggestionLog(s)} disabled={logTask.isPending} activeOpacity={0.75} accessibilityRole="button">
                  <Text style={styles.suggestionIcon}>🔄</Text>
                  <Text style={styles.suggestionChipText} numberOfLines={1}>{t.suggestionPrompt(resolveTaskDisplayName(s.name, t))}</Text>
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
          {!selectionMode && <TouchableOpacity style={styles.scoringGuideButton} onPress={() => setShowScoringGuide(true)} hitSlop={15} accessibilityRole="button" accessibilityLabel={t.scoringGuideTitle}><Text style={styles.scoringGuideText}>?</Text></TouchableOpacity>}
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
              <View style={styles.emptyCtaPill}>
                <Text style={styles.emptyCtaText}>{t.emptyDesc}</Text>
              </View>
              <FabArrow color={colors.primary} reduceMotion={reduceMotion} />
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
                  totalDurationMin={totalDurations?.get(item.id)?.duration}
                  starsEarned={totalDurations?.get(item.id)?.stars}
                  pointsEarned={totalDurations?.get(item.id)?.points}
                  onPress={handleTaskPress}
                  onLongPress={handleTaskLongPress}
                  onEdit={setEditTask}
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
          logBtn: t.logBtn,
          cancel: t.cancel,
          error: t.error,
          validDuration: t.validDuration,
          maxDuration: t.maxDuration,
        }}
      />
      <StreakMilestoneCelebrationModal
        milestone={pendingLevelUp === null ? pendingStreakMilestone : null}
        onDismiss={() => setPendingStreakMilestone(null)}
      />
      <BackfillFlow
        backfillDate={backfillDate}
        setBackfillDate={setBackfillDate}
        backfillsUsedThisWeek={backfillStatus?.backfillsUsedThisWeek}
        userId={userId}
        setPendingStreakMilestone={setPendingStreakMilestone}
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
    hi: { fontSize: 25, fontFamily: FontFamily.extraBold, letterSpacing: -0.7, color: C.inkDark },
    date: { fontSize: 12, fontFamily: FontFamily.bold, color: C.ink2, marginBottom: 1 },
    topbarActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    starChip: { backgroundColor: C.surface2, borderRadius: Radii.pill, paddingHorizontal: 13, paddingVertical: 10 },
    starChipText: { color: C.starGoldText, fontSize: 15, fontFamily: FontFamily.extraBold },
    iconBtn: {
      width: 44, height: 44, borderRadius: 22,
      justifyContent: 'center', alignItems: 'center',
      position: 'relative',
    },
    iconGlyph: { fontSize: 21 },
    newsDot: {
      position: 'absolute', top: 8, right: 8,
      width: 10, height: 10, borderRadius: 5,
      backgroundColor: C.danger, borderWidth: 2, borderColor: C.bgBase,
    },

    challengeEntryCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginHorizontal: Spacing.lg, marginTop: 12,
      backgroundColor: C.surface, borderRadius: Radii.lg, padding: 14,
      ...Shadows.light,
    },
    challengeEntryIcon: { fontSize: 20 },
    challengeEntryText: { flex: 1, fontSize: 15, fontFamily: FontFamily.semiBold, color: C.inkDark },
    challengeEntryArrow: { fontSize: 16, fontFamily: FontFamily.semiBold, color: C.muted },

    sectionLabel: {
      fontSize: 12, fontFamily: FontFamily.semiBold, color: C.ink2,
      marginHorizontal: Spacing.lg, marginTop: 20, marginBottom: 9,
    },
    taskListHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    scoringGuideButton: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: C.line2, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', marginTop: 20, marginRight: Spacing.lg },
    scoringGuideText: { color: C.muted, fontSize: 11, lineHeight: 13, fontFamily: FontFamily.extraBold },
    selActions: { flexDirection: 'row', gap: 8, marginRight: Spacing.lg, marginTop: 20 },
    selBtn: {
      paddingHorizontal: 10, paddingVertical: 10,
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
      flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg, marginBottom: 6,
      backgroundColor: C.surface, borderRadius: Radii.pill,
      borderWidth: 1, borderColor: C.primaryLine, ...Shadows.light,
    },
    suggestionRowFirst: { marginTop: Spacing.sm },
    suggestionChip: {
      flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
    },
    suggestionIcon: { marginRight: 10, fontSize: 13 },
    suggestionChipText: { flex: 1, color: C.primary, fontSize: 13, fontFamily: FontFamily.semiBold },
    suggestionDismiss: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
    suggestionDismissText: { color: C.muted, fontSize: 14, fontFamily: FontFamily.bold },

    empty: { padding: 36, paddingHorizontal: 12, alignItems: 'center' },
    emptyEmoji: { fontSize: 42, marginBottom: 8, opacity: 0.6 },
    emptyTitle: { fontSize: 14, fontFamily: FontFamily.bold, color: C.ink2 },
    emptyCtaPill: { marginTop: 12, backgroundColor: C.primarySoft, borderRadius: Radii.pill, paddingHorizontal: 16, paddingVertical: 8 },
    emptyCtaText: { fontSize: 13, color: C.primary, fontFamily: FontFamily.semiBold },

    modalBg: { flex: 1, backgroundColor: C.scrim, justifyContent: 'center', paddingHorizontal: Spacing.lg },
    modalBox: {
      backgroundColor: C.surface, padding: Spacing.xl,
      borderRadius: Radii.xl,
    },
    modalTitle: { fontSize: 19, fontFamily: FontFamily.extraBold, color: C.inkDark, marginBottom: 4 },
    modalSub: { fontSize: 13, color: C.muted, marginBottom: Spacing.md },
    btn: { backgroundColor: C.primary, padding: 15, borderRadius: Radii.md, alignItems: 'center', marginBottom: 8 },
    btnText: { color: C.white, fontSize: 15, fontFamily: FontFamily.bold },
    cancel: { textAlign: 'center', color: C.muted, padding: 8 },
  });
}
