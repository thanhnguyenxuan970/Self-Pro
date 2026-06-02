import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import {
  useTodayTasks, useDailySummary, useWeeklySummary,
  useLogTask, useTodayLoggedTaskIds,
} from '../queries/useToday';
import { useArchiveTask } from '../queries/useTasks';
import { useRankData } from '../queries/useRank';
import { getCurrentTier } from '../logic/rankUtils';
import { Radii, Spacing, Shadows, AppColors } from '../theme';
import { useAuthUser, useGoogleUser } from '../hooks/useAuth';
import { useTheme, useTranslations } from '../hooks/useSettings';

const DAILY_THRESHOLD = 50;

type Task = {
  id: number; name: string; kind: string; is_time_based: number;
  base_points: number; star_penalty: number; icon: string | null;
  category_id: number | null;
};

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
  const { data: rankData } = useRankData(userId);
  const logTask = useLogTask(userId);

  const archiveTask = useArchiveTask(userId);

  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [duration, setDuration] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const enterSelection = useCallback((id: number) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set((tasks ?? []).map(t => t.id)));
  }, [tasks]);

  const cancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

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
  const isDebt = weeklyStars < 0;
  const progressPct = Math.min(dailyPoints / DAILY_THRESHOLD, 1);

  const currentTier = rankData && rankData.tiers.length > 0
    ? getCurrentTier(weeklyStars, rankData.tiers)
    : null;
  const rankName = currentTier?.rank_name ?? '—';

  const RANK_EMOJI: Record<number, string> = { 1: '🎮', 2: '🐣', 3: '🤡', 4: '🌀', 5: '✨', 6: '🔥', 7: '👑', 8: '💀' };
  const rankEmoji = currentTier ? (RANK_EMOJI[currentTier.tier_order] ?? '⭐') : '⭐';

  const avatarInitial = (googleUser?.name?.charAt(0) ?? 'B').toUpperCase();

  const today = new Date();
  const dateStr = `${t.dayNames[today.getDay()]}, ${t.dateStr(today.getDate(), today.getMonth() + 1)}`;

  const displayTasks = tasks ?? [];

  async function handleLog(task: Task) {
    if (task.is_time_based) { setModalTask(task); return; }
    try {
      await logTask.mutateAsync({
        taskTypeId: task.id, kind: task.kind as 'GOOD' | 'BAD',
        isTimeBased: false, basePoints: task.base_points, starPenalty: task.star_penalty,
      });
    } catch { Alert.alert(t.error, t.cantLog); }
  }

  async function handleLogTime() {
    if (!modalTask) return;
    const mins = parseInt(duration, 10);
    if (isNaN(mins) || mins <= 0) { Alert.alert(t.validMins); return; }
    try {
      await logTask.mutateAsync({
        taskTypeId: modalTask.id, kind: modalTask.kind as 'GOOD' | 'BAD',
        isTimeBased: true, basePoints: modalTask.base_points,
        starPenalty: modalTask.star_penalty, durationMin: mins,
      });
      setModalTask(null); setDuration('');
    } catch { Alert.alert(t.error, t.cantLog); }
  }

  if (isLoading) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Topbar */}
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
            <View style={styles.rankChip}>
              <Text style={styles.rankChipText}>{rankEmoji} {rankName}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Progress card */}
        <View style={styles.progCard}>
          <View style={styles.progTop}>
            <Text style={styles.progLabel}>{t.pointsLabel}</Text>
            <Text style={styles.progPts}><Text style={styles.progPtsBold}>{dailyPoints}</Text> / {DAILY_THRESHOLD}</Text>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${progressPct * 100}%` as any }]} />
          </View>
          <Text style={styles.progCap}>{t.streakBonus(DAILY_THRESHOLD)}</Text>
        </View>

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
              <Text style={styles.emptyEmoji}>🌱</Text>
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
                <TouchableOpacity
                  key={item.id}
                  style={[styles.task, isLast && styles.taskLast, isSelected && styles.taskSelected]}
                  onPress={() => selectionMode ? toggleSelect(item.id) : handleLog(item)}
                  onLongPress={() => enterSelection(item.id)}
                  delayLongPress={300}
                  disabled={!selectionMode && logTask.isPending}
                  activeOpacity={0.7}
                >
                  <View style={[styles.check, selectionMode ? (isSelected && styles.checkDone) : (done && (isBad ? styles.checkBad : styles.checkDone))]}>
                    <Text style={styles.checkMark}>
                      {selectionMode ? (isSelected ? '✓' : '') : (done ? (isBad ? '✕' : '✓') : '')}
                    </Text>
                  </View>
                  <View style={styles.tBody}>
                    <Text style={[styles.tName, done && styles.tNameDone]}>{item.name}</Text>
                    <View style={styles.tMeta}>
                      {item.icon ? <Text style={styles.tMetaText}>{item.icon}</Text> : null}
                      {item.icon ? <View style={styles.dot} /> : null}
                      {item.is_time_based ? <Text style={styles.tMetaText}>{t.timedMeta}</Text> : null}
                      <View style={styles.dot} />
                      <Text style={styles.tMetaText}>
                        {isBad ? t.badHabitMeta : `${item.is_time_based ? '1pt/30m' : t.ptsLabel(item.base_points)}`}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.tPts, done ? (isBad ? styles.tPtsNeg : styles.tPtsPos) : styles.tPtsIdle]}>
                    {isBad ? `−${item.star_penalty} ★` : '+1 ★'}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Duration modal */}
      <Modal visible={!!modalTask} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{t.minutesModal}</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={duration}
              onChangeText={setDuration}
              placeholder={t.minutesPlaceholder}
              placeholderTextColor={colors.faint}
              autoFocus
            />
            <TouchableOpacity style={styles.btn} onPress={handleLogTime}>
              <Text style={styles.btnText}>{t.logBtn}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setModalTask(null); setDuration(''); }}>
              <Text style={styles.cancel}>{t.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bgBase },

    topbar: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: Spacing.lg, paddingTop: 52, paddingBottom: 2,
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
    task: {
      flexDirection: 'row', alignItems: 'center', gap: 13,
      paddingVertical: 14, borderBottomWidth: 1, borderColor: C.line,
    },
    taskLast: { borderBottomWidth: 0 },
    taskSelected: { backgroundColor: C.primarySoft, marginHorizontal: -15, paddingHorizontal: 15 },
    check: {
      width: 26, height: 26, borderRadius: 13,
      borderWidth: 2, borderColor: C.line2,
      backgroundColor: C.surface,
      justifyContent: 'center', alignItems: 'center',
      flexShrink: 0,
    },
    checkDone: {
      backgroundColor: C.primary, borderColor: C.primary,
    },
    checkBad: {
      backgroundColor: C.danger, borderColor: C.danger,
    },
    checkMark: { fontSize: 13, fontWeight: '800', color: '#fff' },
    tBody: { flex: 1, minWidth: 0 },
    tName: { fontSize: 14.5, fontWeight: '600', color: C.inkDark },
    tNameDone: { color: C.muted, textDecorationLine: 'line-through' },
    tMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    tMetaText: { fontSize: 11.5, color: C.muted },
    dot: { width: 3, height: 3, backgroundColor: C.faint, borderRadius: 2 },
    tPts: { fontSize: 13, fontWeight: '800', flexShrink: 0 },
    tPtsPos: { color: C.primary },
    tPtsNeg: { color: C.danger },
    tPtsIdle: { color: C.faint },

    empty: { padding: 36, paddingHorizontal: 12, alignItems: 'center' },
    emptyEmoji: { fontSize: 42, marginBottom: 8, opacity: 0.6 },
    emptyTitle: { fontSize: 14, fontWeight: '700', color: C.ink2 },
    emptyDesc: { fontSize: 12, color: C.muted, marginTop: 4 },

    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalBox: {
      backgroundColor: C.surface, padding: Spacing.xl,
      borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl,
    },
    modalTitle: { fontSize: 19, fontWeight: '800', color: C.inkDark, marginBottom: Spacing.md },
    input: {
      backgroundColor: C.surface2, color: C.inkDark, padding: 13,
      borderRadius: Radii.md, fontSize: 14, marginBottom: Spacing.md,
      borderWidth: 1.5, borderColor: C.line2,
    },
    btn: { backgroundColor: C.primary, padding: 15, borderRadius: Radii.md, alignItems: 'center', marginBottom: 8 },
    btnText: { color: C.white, fontSize: 15, fontWeight: '700' },
    cancel: { textAlign: 'center', color: C.muted, padding: 8 },
  });
}
