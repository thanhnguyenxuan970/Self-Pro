import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, TextInput, Alert, Animated, AccessibilityInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import {
  useTodayTasks, useDailySummary, useWeeklySummary,
  useLogTask, useUnlogTask, useTodayLoggedTaskIds, useConsecutiveSuggestions,
  useTodayTaskTotalDurations,
} from '../queries/useToday';
import { useArchiveTask } from '../queries/useTasks';
import { useRankData } from '../queries/useRank';
import { getCurrentTier } from '../game/tierLookup';
import { Radii, Spacing, Shadows, AppColors } from '../config/theme';
import { Task, TaskRow } from '../components/TaskRow';
import { useAuthUser, useGoogleUser } from '../hooks/useAuth';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { cueStreakMilestone } from '../audio/uiSounds';
import { useSelectionMode } from '../hooks/useSelectionMode';
import { DAILY_BONUS_THRESHOLD } from '../config/constants';

export function TodayScreen() {
  const navigation = useNavigation();
  const userId = useAuthUser();
  const googleUser = useGoogleUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
  const [duration, setDuration] = useState('');
  const [durationUnit, setDurationUnit] = useState<'min' | 'hr'>('min');
  const [customDuration, setCustomDuration] = useState(false);
  const [justLoggedIds, setJustLoggedIds] = useState<Set<number>>(new Set());
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());

  const { data: suggestions = [] } = useConsecutiveSuggestions(userId);

  const { selectionMode, selectedIds, enterSelection, toggleSelect, selectAll, cancelSelection } = useSelectionMode(tasks ?? []);

  function handleDeleteSelected() {
    const ids = Array.from(selectedIds);
    Alert.alert(
      t.removeTasksTitle,
      t.hideTasksMsg(ids.length),
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.delete, style: 'destructive',
          onPress: async () => {
            try {
              for (const id of ids) {
                await archiveTask.mutateAsync(id);
              }
              cancelSelection();
            } catch {
              Alert.alert(t.error, t.cantLog);
            }
          },
        },
      ]
    );
  }

  const weeklyStars = weekly?.weekly_stars ?? 0;
  const dailyPoints = daily?.total_points ?? 0;
  const streak = daily?.streak_count ?? 0;
  const isDebt = weeklyStars < 0;
  const currentTier = rankData && rankData.tiers.length > 0
    ? getCurrentTier(weeklyStars, rankData.tiers)
    : null;
  const rankName = currentTier?.rank_name ?? '—';

  const RANK_EMOJI: Record<number, string> = { 1: '🎮', 2: '🐣', 3: '🤡', 4: '🌀', 5: '✨', 6: '🔥', 7: '👑' };
  const rankEmoji = currentTier ? (RANK_EMOJI[currentTier.tier_order] ?? '⭐') : '⭐';

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  const rankBounceAnim = useRef(new Animated.Value(1)).current;
  const prevRankNameRef = useRef(rankName);
  useEffect(() => {
    if (reduceMotion) return;
    if (prevRankNameRef.current !== rankName) {
      prevRankNameRef.current = rankName;
      Animated.sequence([
        Animated.spring(rankBounceAnim, { toValue: 1.25, tension: 120, friction: 6, useNativeDriver: true }),
        Animated.spring(rankBounceAnim, { toValue: 1, tension: 120, friction: 6, useNativeDriver: true }),
      ]).start();
    }
  }, [rankName, reduceMotion]);

  const streakPulseAnim = useRef(new Animated.Value(1)).current;
  const hasStreak = streak > 0;
  useEffect(() => {
    if (!hasStreak || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(streakPulseAnim, { toValue: 1.08, duration: 400, useNativeDriver: true }),
        Animated.timing(streakPulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasStreak, reduceMotion]);

  const barWidthAnim = useRef(new Animated.Value(Math.min(dailyPoints / DAILY_BONUS_THRESHOLD, 1) * 100)).current;
  const barGlowOpacity = useRef(new Animated.Value(0)).current;
  const prevDailyRef = useRef(dailyPoints);
  useEffect(() => {
    const targetPct = Math.min(dailyPoints / DAILY_BONUS_THRESHOLD, 1) * 100;
    Animated.spring(barWidthAnim, { toValue: targetPct, tension: 100, friction: 8, useNativeDriver: false }).start();
    const prev = prevDailyRef.current;
    const h = DAILY_BONUS_THRESHOLD;
    if ((prev < h / 2 && dailyPoints >= h / 2) || (prev < h && dailyPoints >= h)) {
      barGlowOpacity.setValue(0.7);
      Animated.timing(barGlowOpacity, { toValue: 0, duration: 700, useNativeDriver: false }).start();
    }
    prevDailyRef.current = dailyPoints;
  }, [dailyPoints]);

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
    // Timed: always open duration modal (first log or add more time)
    if (task.is_time_based) {
      setCustomDuration(false);
      setModalTask(task);
      return;
    }
    // Non-timed: toggle undo if already logged today
    if (loggedIds?.has(task.id)) {
      try {
        await unlogTask.mutateAsync({ taskTypeId: task.id, kind: task.kind as 'GOOD' | 'BAD' });
      } catch { Alert.alert(t.error, t.cantLog); }
      return;
    }
    if (justLoggedIds.has(task.id)) return;
    try {
      const result = await logTask.mutateAsync({
        taskTypeId: task.id, kind: task.kind as 'GOOD' | 'BAD',
        isTimeBased: false, basePoints: task.base_points, starPenalty: task.star_penalty,
      });
      showStreakToast(result.newStreak, result.prevStreak);
      setJustLoggedIds(prev => new Set(prev).add(task.id));
      setTimeout(() => {
        setJustLoggedIds(prev => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }, 1500);
    } catch { Alert.alert(t.error, t.cantLog); }
  }

  async function handleLogTime(fixedMins?: number) {
    if (!modalTask) return;
    let mins: number;
    if (fixedMins !== undefined) {
      mins = fixedMins;
    } else {
      const parsed = parseInt(duration, 10);
      if (isNaN(parsed) || parsed <= 0) { Alert.alert(t.validDuration); return; }
      mins = durationUnit === 'hr' ? parsed * 60 : parsed;
      if (mins > 1440) { Alert.alert(t.validDuration); return; } // cap at 24h
    }
    try {
      const result = await logTask.mutateAsync({
        taskTypeId: modalTask.id, kind: modalTask.kind as 'GOOD' | 'BAD',
        isTimeBased: true, basePoints: modalTask.base_points,
        starPenalty: modalTask.star_penalty, durationMin: mins,
      });
      showStreakToast(result.newStreak, result.prevStreak);
      setModalTask(null); setDuration(''); setDurationUnit('min'); setCustomDuration(false);
    } catch { Alert.alert(t.error, t.cantLog); }
  }

  async function handleSuggestionLog(task: { id: number; name: string; kind: string; is_time_based: number; base_points: number; star_penalty: number; icon: string | null }) {
    if (task.is_time_based) {
      setCustomDuration(false);
      setModalTask({ ...task, category_id: null, sort_order: 0 });
      return;
    }
    try {
      const result = await logTask.mutateAsync({
        taskTypeId: task.id,
        kind: task.kind as 'GOOD' | 'BAD',
        isTimeBased: false,
        basePoints: task.base_points,
        starPenalty: task.star_penalty,
      });
      showStreakToast(result.newStreak, result.prevStreak);
      setDismissedSuggestions(prev => new Set(prev).add(task.id));
    } catch { Alert.alert(t.error, t.cantLog); }
  }

  function dismissSuggestion(id: number) {
    setDismissedSuggestions(prev => new Set(prev).add(id));
  }

  if (isLoading) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Topbar — outside ScrollView so it stays fixed */}
      <View style={styles.topbar}>
        <TouchableOpacity
          style={styles.avatar}
          onPress={() => navigation.navigate('Profile' as never)}
          activeOpacity={0.85}
        >
          <Text style={styles.avatarText}>{avatarInitial}</Text>
        </TouchableOpacity>
        <View style={styles.greet}>
          <Text style={styles.hi}>{t.greeting(googleUser?.name?.split(' ').pop() ?? '')}</Text>
          <Text style={styles.date}>{dateStr}</Text>
        </View>
        <TouchableOpacity
          style={styles.gearBtn}
          onPress={() => navigation.navigate('Settings' as never)}
          activeOpacity={0.7}
        >
          <Text style={styles.gearIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Hero card */}
        <LinearGradient
          colors={isDebt ? ['#5C1D1E', '#B0383C'] : ['#1A5039', '#2E9C6A']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroLabel}>{t.heroLabel}</Text>
          <View style={styles.heroBal}>
            <Text style={styles.heroStar}>★</Text>
            <Text style={styles.heroBalNum}>{weeklyStars}</Text>
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
            <Animated.View style={{ alignSelf: 'center', transform: [{ scale: streakPulseAnim }] }}>
              <Text style={styles.heroStreak}>{t.streakChip(streak)}</Text>
            </Animated.View>
          )}
        </LinearGradient>

        {/* Progress card */}
        <View style={styles.progCard}>
          <View style={styles.progTop}>
            <Text style={styles.progLabel}>{t.pointsLabel}</Text>
            <Text style={styles.progPts}><Text style={styles.progPtsBold}>{dailyPoints}</Text> / {DAILY_BONUS_THRESHOLD}</Text>
          </View>
          <View style={styles.bar}>
            <Animated.View
              style={[styles.barFill, { width: barWidthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]}
            />
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: barGlowOpacity, borderRadius: Radii.pill }]} />
          </View>
          <Text style={styles.progCap}>{t.streakBonus(DAILY_BONUS_THRESHOLD)}</Text>
        </View>

        {/* Smart suggestion chips */}
        {!selectionMode && suggestions
          .filter(s => !dismissedSuggestions.has(s.id) && !(loggedIds?.has(s.id)))
          .map(s => (
            <View key={s.id} style={styles.suggestionRow}>
              <TouchableOpacity
                style={styles.suggestionChip}
                onPress={() => handleSuggestionLog(s)}
                disabled={logTask.isPending}
                activeOpacity={0.75}
              >
                <Text style={styles.suggestionChipText}>
                  🔄 {t.suggestionPrompt(s.name)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.suggestionDismiss}
                onPress={() => dismissSuggestion(s.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.suggestionDismissText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))
        }

        {/* Task list header with selection actions */}
        <View style={styles.taskListHeader}>
          <Text style={styles.sectionLabel}>{t.sectionToday}</Text>
          {selectionMode && (
            <View style={styles.selActions}>
              <TouchableOpacity onPress={selectAll} style={styles.selBtn}>
                <Text style={styles.selBtnTxt}>{t.all}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteSelected}
                style={[styles.selBtn, styles.selDeleteBtn]}
                disabled={selectedIds.size === 0 || archiveTask.isPending}
              >
                <Text style={styles.selDeleteTxt}>{t.deleteCount(selectedIds.size)}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={cancelSelection} style={styles.selBtn}>
                <Text style={styles.selBtnTxt}>{t.cancel}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <View style={styles.taskCard}>
          {displayTasks.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🎯</Text>
              <Text style={styles.emptyTitle}>{t.emptyTitle}</Text>
              <Text style={styles.emptyDesc}>{t.emptyDesc}</Text>
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

      {/* Duration modal */}
      <Modal visible={!!modalTask} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{modalTask?.name}</Text>
            <Text style={styles.modalSub}>{t.addActivityHowLong}</Text>

            {!customDuration ? (
              <View style={styles.presetChipsRow}>
                {([{label: '30m', mins: 30}, {label: '45m', mins: 45}, {label: '1h', mins: 60}] as const).map(p => (
                  <TouchableOpacity
                    key={p.label}
                    style={styles.presetChip}
                    onPress={() => handleLogTime(p.mins)}
                    disabled={logTask.isPending}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.presetChipText}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.presetChip, styles.presetChipCustom]}
                  onPress={() => setCustomDuration(true)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.presetChipText, styles.presetChipCustomText]}>{t.durationCustom}</Text>
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
                      <Text style={[styles.unitBtnText, durationUnit === 'min' && styles.unitBtnTextActive]}>
                        {t.unitMin}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.unitBtn, durationUnit === 'hr' && styles.unitBtnActive]}
                      onPress={() => setDurationUnit('hr')}
                    >
                      <Text style={[styles.unitBtnText, durationUnit === 'hr' && styles.unitBtnTextActive]}>
                        {t.unitHour}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <TouchableOpacity style={styles.btn} onPress={() => handleLogTime()} disabled={logTask.isPending}>
                  <Text style={styles.btnText}>{t.logBtn}</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={() => {
              setModalTask(null); setDuration(''); setDurationUnit('min'); setCustomDuration(false);
            }}>
              <Text style={styles.cancel}>{t.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    avatarText: { fontWeight: '800', color: C.primaryPress, fontSize: 16 },
    greet: { flex: 1 },
    hi: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2, color: C.inkDark },
    date: { fontSize: 12, color: C.muted, marginTop: 1 },
    gearBtn: { padding: 6 },
    gearIcon: { fontSize: 22 },

    hero: {
      marginHorizontal: Spacing.lg, marginTop: 14,
      borderRadius: Radii.xl, padding: 20, overflow: 'hidden',
      ...Shadows.hero,
    },
    heroLabel: { fontSize: 12, opacity: 0.85, fontWeight: '600', letterSpacing: 0.3, color: '#fff' },
    heroBal: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
    heroStar: { fontSize: 32, color: C.starGold },
    heroBalNum: { fontSize: 40, fontWeight: '800', letterSpacing: -1.2, color: '#fff', lineHeight: 44 },
    heroFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
    heroDelta: { fontSize: 12, paddingHorizontal: 11, paddingVertical: 5, borderRadius: Radii.pill, fontWeight: '700', overflow: 'hidden' },
    heroDeltaUp: { backgroundColor: 'rgba(255,255,255,0.16)', color: '#B5F0CE' },
    heroDeltaDown: { backgroundColor: 'rgba(255,255,255,0.16)', color: '#FFB9BB' },
    rankChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: Radii.pill,
    },
    rankChipText: { fontSize: 12.5, fontWeight: '800', color: '#fff' },
    heroStreak: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 13,
      fontWeight: '600',
      marginTop: 8,
      alignSelf: 'center',
      letterSpacing: 0.3,
    },

    progCard: {
      marginHorizontal: Spacing.lg, marginTop: 12,
      backgroundColor: C.surface, borderRadius: Radii.lg,
      padding: 15, borderWidth: 1, borderColor: C.line, ...Shadows.light,
    },
    progTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    progLabel: { fontSize: 13, fontWeight: '700', color: C.inkDark },
    progPts: { fontSize: 13, fontWeight: '700', color: C.inkDark },
    progPtsBold: { fontSize: 16, fontWeight: '800', color: C.primary },
    bar: {
      height: 10, backgroundColor: C.surface2, borderRadius: Radii.pill,
      marginTop: 10, overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      backgroundColor: C.primary,
      borderRadius: Radii.pill,
    },
    progCap: { fontSize: 11.5, color: C.muted, marginTop: 8 },

    sectionLabel: {
      fontSize: 11, fontWeight: '700', color: C.muted,
      textTransform: 'uppercase', letterSpacing: 0.7,
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
    selBtnTxt: { fontSize: 12, fontWeight: '700', color: C.inkDark },
    selDeleteBtn: { borderColor: C.danger, backgroundColor: C.dangerSoft },
    selDeleteTxt: { fontSize: 12, fontWeight: '700', color: C.danger },

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
    suggestionChipText: { color: C.primary, fontSize: 13, fontWeight: '600' },
    suggestionDismiss: {
      marginLeft: 8, padding: 4,
    },
    suggestionDismissText: { color: C.faint, fontSize: 14, fontWeight: '700' },

    empty: { padding: 36, paddingHorizontal: 12, alignItems: 'center' },
    emptyEmoji: { fontSize: 42, marginBottom: 8, opacity: 0.6 },
    emptyTitle: { fontSize: 14, fontWeight: '700', color: C.ink2 },
    emptyDesc: { fontSize: 12, color: C.muted, marginTop: 4 },

    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalBox: {
      backgroundColor: C.surface, padding: Spacing.xl,
      borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl,
    },
    modalTitle: { fontSize: 19, fontWeight: '800', color: C.inkDark, marginBottom: 4 },
    modalSub: { fontSize: 13, color: C.muted, marginBottom: Spacing.md },
    presetChipsRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.md, flexWrap: 'wrap' },
    presetChip: {
      flex: 1, minWidth: 60, backgroundColor: C.primary,
      borderRadius: Radii.md, paddingVertical: 16,
      alignItems: 'center', justifyContent: 'center',
    },
    presetChipCustom: { backgroundColor: C.surface2, borderWidth: 1.5, borderColor: C.line2 },
    presetChipText: { color: C.white, fontSize: 16, fontWeight: '800' },
    presetChipCustomText: { color: C.inkDark },
    durationRow: {
      flexDirection: 'row', alignItems: 'stretch', gap: 10, marginBottom: Spacing.md,
    },
    input: {
      backgroundColor: C.surface2, color: C.inkDark, padding: 13,
      borderRadius: Radii.md, fontSize: 14,
      borderWidth: 1.5, borderColor: C.line2,
    },
    durationInput: { flex: 1, fontSize: 22, fontWeight: '700', textAlign: 'center' },
    unitToggle: {
      flexDirection: 'column', borderRadius: Radii.md, overflow: 'hidden',
      borderWidth: 1.5, borderColor: C.line2,
    },
    unitBtn: {
      flex: 1, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center',
      backgroundColor: C.surface2,
    },
    unitBtnActive: { backgroundColor: C.primary },
    unitBtnText: { fontSize: 13, fontWeight: '700', color: C.muted },
    unitBtnTextActive: { color: C.white },
    btn: { backgroundColor: C.primary, padding: 15, borderRadius: Radii.md, alignItems: 'center', marginBottom: 8 },
    btnText: { color: C.white, fontSize: 15, fontWeight: '700' },
    cancel: { textAlign: 'center', color: C.muted, padding: 8 },
  });
}
