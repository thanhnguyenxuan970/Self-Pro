import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Alert, ScrollView, Image,
} from 'react-native';
import { useWeeklySummary, useDailySummary } from '../queries/useToday';
import { useNotificationTime, useSetNotificationTime } from '../queries/useSettings';
import { scheduleHabitReminder, cancelHabitReminder } from '../logic/notifications';
import Toast from 'react-native-toast-message';
import { useTreatPool } from '../queries/useTreats';
import { useRecentActivityLogs, ActivityLogEntry } from '../queries/useProgress';
import { Colors, Radii, Spacing, Shadows } from '../theme';
import { useAuthUser } from '../hooks/useAuth';

type Props = {
  googleUser: { email: string; name: string; picture: string };
  onSignOut: () => Promise<void>;
};

export function ProfileScreen({ googleUser, onSignOut }: Props) {
  const userId = useAuthUser();
  const { data: weekly } = useWeeklySummary(userId);
  const { data: daily } = useDailySummary(userId);
  const { data: treatPool } = useTreatPool(userId);
  const { data: actLogs = [] } = useRecentActivityLogs(userId, 30);

  const { data: savedNotifTime } = useNotificationTime(userId);
  const setNotifTimeMutation = useSetNotificationTime(userId);
  const [notifInput, setNotifInput] = useState('');
  const [savingNotif, setSavingNotif] = useState(false);

  useEffect(() => {
    setNotifInput(savedNotifTime ?? '');
  }, [savedNotifTime]);

  const weeklyStars = weekly?.weekly_stars ?? 0;
  const streak = daily?.streak_count ?? 0;

  async function handleSaveNotif() {
    const trimmed = notifInput.trim();
    setSavingNotif(true);
    try {
      if (!trimmed) {
        await cancelHabitReminder();
        await setNotifTimeMutation.mutateAsync(null);
        Toast.show({ type: 'success', text1: 'Đã tắt thông báo' });
      } else {
        await scheduleHabitReminder(trimmed);
        await setNotifTimeMutation.mutateAsync(trimmed);
        Toast.show({ type: 'success', text1: 'Đã lưu thông báo', text2: trimmed });
      }
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message ?? 'Không thể lưu thông báo');
    } finally {
      setSavingNotif(false);
    }
  }

  function formatLogDate(entry: ActivityLogEntry): string {
    const d = new Date(entry.logged_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Centered profile header */}
      <View style={ph.head}>
        {googleUser.picture ? (
          <Image source={{ uri: googleUser.picture }} style={ph.avatar} />
        ) : (
          <View style={[ph.avatar, ph.avatarFallback]}>
            <Text style={ph.avatarInitial}>{(googleUser.name.charAt(0) || '?').toUpperCase()}</Text>
          </View>
        )}
        <Text style={ph.name}>{googleUser.name}</Text>
        <Text style={ph.sub}>{googleUser.email}</Text>
      </View>

      {/* Life stats row */}
      <View style={ph.lifeRow}>
        <View style={ph.lifeCell}>
          <Text style={ph.lifeV}>{weeklyStars} ★</Text>
          <Text style={ph.lifeL}>Rank</Text>
        </View>
        <View style={[ph.lifeCell, ph.lifeDivider]}>
          <Text style={ph.lifeV}>{streak} 🔥</Text>
          <Text style={ph.lifeL}>Streak</Text>
        </View>
        <View style={ph.lifeCell}>
          <Text style={ph.lifeV}>★ {treatPool?.treat_stars ?? 0}</Text>
          <Text style={ph.lifeL}>Tuần này</Text>
        </View>
      </View>

      {/* Settings */}
      <Text style={styles.sectionLabel}>CÀI ĐẶT</Text>
      <View style={styles.settingsCard}>
        <View style={[styles.set, styles.setLast, { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
            <Text style={styles.setIc}>🔔</Text>
            <Text style={styles.setSl}>Nhắc nhở</Text>
            <Text style={styles.setSv}>{savedNotifTime || '—'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 26 }}>
            <TextInput
              style={styles.notifInput}
              value={notifInput}
              onChangeText={setNotifInput}
              placeholder="HH:MM"
              placeholderTextColor={Colors.faint}
              keyboardType="numbers-and-punctuation"
            />
            <TouchableOpacity
              style={[styles.notifSaveBtn, savingNotif && { opacity: 0.5 }]}
              onPress={handleSaveNotif}
              disabled={savingNotif}
            >
              <Text style={styles.notifSaveTxt}>Lưu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* History section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Lịch sử</Text>
      </View>

      {actLogs.length === 0 ? (
        <View style={styles.taskCard}>
          <Text style={styles.empty}>Chưa có hoạt động nào</Text>
        </View>
      ) : (
        <View style={styles.taskCard}>
          {actLogs.map((item, idx) => (
            <View
              key={item.id}
              style={[styles.row, idx === actLogs.length - 1 && styles.rowLast]}
            >
              <Text style={styles.icon}>{item.stars_delta >= 0 ? '✅' : '❌'}</Text>
              <View style={styles.rowBody}>
                <Text style={styles.taskName} numberOfLines={1}>
                  {item.task_name ?? (item.source === 'BONUS' ? '🎯 Bonus ngày' : item.source)}
                </Text>
                <Text style={styles.taskMeta}>{formatLogDate(item)}</Text>
              </View>
              <Text style={[styles.stars, item.stars_delta < 0 && styles.starsNeg]}>
                {item.stars_delta >= 0 ? '+' : ''}{item.stars_delta.toFixed(1)} ★
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={onSignOut} activeOpacity={0.8}>
        <Text style={styles.logoutBtnText}>↺  Đăng xuất</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgBase },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.7,
    paddingHorizontal: Spacing.lg, marginBottom: 9, marginTop: 20,
  },
  settingsCard: {
    marginHorizontal: Spacing.lg, backgroundColor: Colors.surface,
    borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.line,
    paddingHorizontal: 15, ...Shadows.light,
  },
  set: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    paddingVertical: 15, borderBottomWidth: 1, borderColor: Colors.line,
  },
  setLast: { borderBottomWidth: 0 },
  setIc: { fontSize: 18, width: 26, textAlign: 'center' },
  setSl: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.inkDark },
  setSv: { fontSize: 12.5, color: Colors.muted, fontWeight: '700' },
  notifInput: {
    flex: 1, backgroundColor: Colors.surface2, color: Colors.inkDark,
    padding: 8, borderRadius: Radii.sm, fontSize: 14,
    borderWidth: 1.5, borderColor: Colors.line2,
  },
  notifSaveBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radii.sm,
  },
  notifSaveTxt: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.inkDark },
  taskCard: {
    marginHorizontal: Spacing.lg, backgroundColor: Colors.surface,
    borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.line,
    paddingHorizontal: 15, ...Shadows.light,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderColor: Colors.line,
  },
  rowLast: { borderBottomWidth: 0 },
  icon: { fontSize: 20, marginRight: 12, flexShrink: 0 },
  rowBody: { flex: 1, minWidth: 0 },
  taskName: { fontSize: 14, color: Colors.inkDark, fontWeight: '600' },
  taskMeta: { fontSize: 11.5, color: Colors.muted, marginTop: 2 },
  stars: { fontSize: 13, fontWeight: '800', color: Colors.primary, flexShrink: 0 },
  starsNeg: { color: Colors.danger },
  empty: { textAlign: 'center', color: Colors.muted, marginTop: 24, marginBottom: 24, fontSize: 14, paddingHorizontal: 12 },
  logoutBtn: {
    marginHorizontal: Spacing.lg, marginTop: 32, marginBottom: 12,
    paddingVertical: 15, borderRadius: Radii.md,
    borderWidth: 1.5, borderColor: Colors.danger,
    alignItems: 'center',
  },
  logoutBtnText: { color: Colors.danger, fontSize: 15, fontWeight: '700' },
});

const ph = StyleSheet.create({
  head: {
    paddingVertical: 14, paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primarySoft,
    borderWidth: 1, borderColor: Colors.line,
    marginBottom: 0,
    shadowColor: '#2E9C6A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 4,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 32, fontWeight: '800', color: Colors.primaryPress },
  name: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: Colors.inkDark, marginTop: 10 },
  sub: { fontSize: 12.5, color: Colors.muted, marginTop: 3 },
  lifeRow: {
    flexDirection: 'row', marginHorizontal: Spacing.lg, marginTop: 14,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line,
    borderRadius: Radii.md, overflow: 'hidden', ...Shadows.light,
  },
  lifeCell: { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6 },
  lifeDivider: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.line },
  lifeV: { fontSize: 17, fontWeight: '800', color: Colors.inkDark },
  lifeL: { fontSize: 10, color: Colors.muted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4 },
});
