import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import {
  useTodayTasks, useDailySummary, useWeeklySummary,
  useLogTask, useCategories, useTodayLoggedTaskIds,
} from '../queries/useToday';
import { useRankData } from '../queries/useRank';
import { getCurrentTier } from '../logic/rankUtils';
import { getLocalDate } from '../logic/formatters';
import { Colors, Radii, Spacing, Shadows } from '../theme';
import { useAuthUser, useGoogleUser } from '../hooks/useAuth';

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

  const { data: tasks, isLoading } = useTodayTasks(userId);
  const { data: daily } = useDailySummary(userId);
  const { data: weekly } = useWeeklySummary(userId);
  const { data: categories } = useCategories(userId);
  const { data: loggedIds } = useTodayLoggedTaskIds(userId);
  const { data: rankData } = useRankData(userId);
  const logTask = useLogTask(userId);

  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [duration, setDuration] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

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
  const dayNames = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dateStr = `${dayNames[today.getDay()]}, ${today.getDate()} tháng ${today.getMonth() + 1}`;

  const filteredTasks = selectedCategoryId === null
    ? tasks ?? []
    : (tasks ?? []).filter(t => t.category_id === selectedCategoryId);

  async function handleLog(task: Task) {
    if (task.is_time_based) { setModalTask(task); return; }
    try {
      await logTask.mutateAsync({
        taskTypeId: task.id, kind: task.kind as 'GOOD' | 'BAD',
        isTimeBased: false, basePoints: task.base_points, starPenalty: task.star_penalty,
      });
    } catch { Alert.alert('Lỗi', 'Không thể ghi nhận. Thử lại.'); }
  }

  async function handleLogTime() {
    if (!modalTask) return;
    const mins = parseInt(duration, 10);
    if (isNaN(mins) || mins <= 0) { Alert.alert('Nhập số phút hợp lệ'); return; }
    try {
      await logTask.mutateAsync({
        taskTypeId: modalTask.id, kind: modalTask.kind as 'GOOD' | 'BAD',
        isTimeBased: true, basePoints: modalTask.base_points,
        starPenalty: modalTask.star_penalty, durationMin: mins,
      });
      setModalTask(null); setDuration('');
    } catch { Alert.alert('Lỗi', 'Không thể ghi nhận. Thử lại.'); }
  }

  if (isLoading) return <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />;

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
            <Text style={styles.hi}>Chào, {googleUser?.name?.split(' ').pop() ?? 'bạn'}</Text>
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
          <Text style={styles.heroLabel}>SỐ DƯ SAO</Text>
          <View style={styles.heroBal}>
            <Text style={styles.heroStar}>★</Text>
            <Text style={styles.heroBalNum}>{weeklyStars}</Text>
          </View>
          <View style={styles.heroFoot}>
            <Text style={[styles.heroDelta, isDebt ? styles.heroDeltaDown : styles.heroDeltaUp]}>
              {dailyPoints > 0 ? `▲ +${dailyPoints} hôm nay` : '— hôm nay'}
            </Text>
            <View style={styles.rankChip}>
              <Text style={styles.rankChipText}>{rankEmoji} {rankName}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Progress card */}
        <View style={styles.progCard}>
          <View style={styles.progTop}>
            <Text style={styles.progLabel}>Điểm hôm nay</Text>
            <Text style={styles.progPts}><Text style={styles.progPtsBold}>{dailyPoints}</Text> / {DAILY_THRESHOLD}</Text>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${progressPct * 100}%` as any }]} />
          </View>
          <Text style={styles.progCap}>Đạt {DAILY_THRESHOLD} điểm/ngày → +1 ★ Streak bonus</Text>
        </View>

        {/* Category chips */}
        {categories && categories.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Bộ lọc danh mục</Text>
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -Spacing.lg }}
              contentContainerStyle={styles.chipRow}
            >
              <TouchableOpacity
                style={[styles.chip, selectedCategoryId === null && styles.chipActive]}
                onPress={() => setSelectedCategoryId(null)}
              >
                <Text style={[styles.chipText, selectedCategoryId === null && styles.chipTextActive]}>Tất cả</Text>
              </TouchableOpacity>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.chip, selectedCategoryId === cat.id && styles.chipActive]}
                  onPress={() => setSelectedCategoryId(cat.id)}
                >
                  <Text style={[styles.chipText, selectedCategoryId === cat.id && styles.chipTextActive]}>
                    {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Task list */}
        <Text style={styles.sectionLabel}>Hôm nay</Text>
        <View style={styles.taskCard}>
          {filteredTasks.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🌱</Text>
              <Text style={styles.emptyTitle}>Hôm nay vẫn chưa có gì</Text>
              <Text style={styles.emptyDesc}>Chạm + để ghi hoạt động đầu tiên</Text>
            </View>
          ) : (
            filteredTasks.map((item, idx) => {
              const done = loggedIds?.has(item.id) ?? false;
              const isBad = item.kind === 'BAD';
              const isLast = idx === filteredTasks.length - 1;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.task, isLast && styles.taskLast]}
                  onPress={() => handleLog(item)}
                  disabled={logTask.isPending}
                  activeOpacity={0.7}
                >
                  <View style={[styles.check, done && (isBad ? styles.checkBad : styles.checkDone)]}>
                    <Text style={styles.checkMark}>{done ? (isBad ? '✕' : '✓') : ''}</Text>
                  </View>
                  <View style={styles.tBody}>
                    <Text style={[styles.tName, done && styles.tNameDone]}>{item.name}</Text>
                    <View style={styles.tMeta}>
                      {item.icon ? <Text style={styles.tMetaText}>{item.icon}</Text> : null}
                      {item.icon ? <View style={styles.dot} /> : null}
                      {item.is_time_based ? <Text style={styles.tMetaText}>Theo giờ</Text> : null}
                      <View style={styles.dot} />
                      <Text style={styles.tMetaText}>
                        {isBad ? 'Thói xấu' : `${item.is_time_based ? '1pt/30m' : item.base_points + ' điểm'}`}
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
            <Text style={styles.modalTitle}>Bao nhiêu phút?</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={duration}
              onChangeText={setDuration}
              placeholder="Ví dụ: 45"
              placeholderTextColor={Colors.faint}
              autoFocus
            />
            <TouchableOpacity style={styles.btn} onPress={handleLogTime}>
              <Text style={styles.btnText}>Ghi nhận</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setModalTask(null); setDuration(''); }}>
              <Text style={styles.cancel}>Huỷ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgBase },

  topbar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.lg, paddingTop: 52, paddingBottom: 2,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.primarySoft, borderWidth: 1, borderColor: Colors.line,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontWeight: '800', color: Colors.primaryPress, fontSize: 16 },
  greet: { flex: 1 },
  hi: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2, color: Colors.inkDark },
  date: { fontSize: 12, color: Colors.muted, marginTop: 1 },
  gearBtn: { padding: 6 },
  gearIcon: { fontSize: 22 },

  hero: {
    marginHorizontal: Spacing.lg, marginTop: 14,
    borderRadius: Radii.xl, padding: 20, overflow: 'hidden',
    ...Shadows.hero,
  },
  heroLabel: { fontSize: 12, opacity: 0.85, fontWeight: '600', letterSpacing: 0.3, color: '#fff' },
  heroBal: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  heroStar: { fontSize: 32, color: '#D9952B' },
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
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: 15, borderWidth: 1, borderColor: Colors.line, ...Shadows.light,
  },
  progTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progLabel: { fontSize: 13, fontWeight: '700', color: Colors.inkDark },
  progPts: { fontSize: 13, fontWeight: '700', color: Colors.inkDark },
  progPtsBold: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  bar: {
    height: 10, backgroundColor: Colors.surface2, borderRadius: Radii.pill,
    marginTop: 10, overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radii.pill,
  },
  progCap: { fontSize: 11.5, color: Colors.muted, marginTop: 8 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.7,
    marginHorizontal: Spacing.lg, marginTop: 20, marginBottom: 9,
  },
  chipRow: { paddingHorizontal: Spacing.lg, gap: 7, flexDirection: 'row', paddingVertical: 2 },
  chip: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: Radii.pill,
    borderWidth: 1, borderColor: Colors.line2, backgroundColor: Colors.surface,
    flexShrink: 0,
  },
  chipActive: { backgroundColor: Colors.primarySoft, borderColor: Colors.primarySoft },
  chipText: { fontSize: 12.5, fontWeight: '600', color: Colors.muted },
  chipTextActive: { color: Colors.primaryPress, fontWeight: '700' },

  taskCard: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    borderWidth: 1, borderColor: Colors.line, ...Shadows.light,
    paddingHorizontal: 15,
  },
  task: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    paddingVertical: 14, borderBottomWidth: 1, borderColor: Colors.line,
  },
  taskLast: { borderBottomWidth: 0 },
  check: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: Colors.line2,
    backgroundColor: Colors.surface,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  checkDone: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
  },
  checkBad: {
    backgroundColor: Colors.danger, borderColor: Colors.danger,
  },
  checkMark: { fontSize: 13, fontWeight: '800', color: '#fff' },
  tBody: { flex: 1, minWidth: 0 },
  tName: { fontSize: 14.5, fontWeight: '600', color: Colors.inkDark },
  tNameDone: { color: Colors.muted, textDecorationLine: 'line-through' },
  tMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  tMetaText: { fontSize: 11.5, color: Colors.muted },
  dot: { width: 3, height: 3, backgroundColor: Colors.faint, borderRadius: 2 },
  tPts: { fontSize: 13, fontWeight: '800', flexShrink: 0 },
  tPtsPos: { color: Colors.primary },
  tPtsNeg: { color: Colors.danger },
  tPtsIdle: { color: Colors.faint },

  empty: { padding: 36, paddingHorizontal: 12, alignItems: 'center' },
  emptyEmoji: { fontSize: 42, marginBottom: 8, opacity: 0.6 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink2 },
  emptyDesc: { fontSize: 12, color: Colors.muted, marginTop: 4 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: Colors.surface, padding: Spacing.xl,
    borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl,
  },
  modalTitle: { fontSize: 19, fontWeight: '800', color: Colors.inkDark, marginBottom: Spacing.md },
  input: {
    backgroundColor: Colors.surface2, color: Colors.inkDark, padding: 13,
    borderRadius: Radii.md, fontSize: 14, marginBottom: Spacing.md,
    borderWidth: 1.5, borderColor: Colors.line2,
  },
  btn: { backgroundColor: Colors.primary, padding: 15, borderRadius: Radii.md, alignItems: 'center', marginBottom: 8 },
  btnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  cancel: { textAlign: 'center', color: Colors.muted, padding: 8 },
});
