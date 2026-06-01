import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, Switch, ScrollView, Image,
} from 'react-native';
import { useTodayTasks, useWeeklySummary, useDailySummary, useCategories } from '../queries/useToday';
import { useNotificationTime, useSetNotificationTime } from '../queries/useSettings';
import { scheduleHabitReminder, cancelHabitReminder } from '../logic/notifications';
import Toast from 'react-native-toast-message';
import { useCreateTask, useUpdateTask, useArchiveTask, useArchiveCategory } from '../queries/useTasks';
import { useFundBalance } from '../queries/useFund';
import { Colors, Typography, Radii, Spacing, Shadows } from '../theme';
import { useAuthUser } from '../hooks/useAuth';

type Task = {
  id: number;
  name: string;
  kind: string;
  is_time_based: number;
  base_points: number;
  star_penalty: number;
  icon: string | null;
};

type TaskForm = {
  id?: number;
  name: string;
  kind: 'GOOD' | 'BAD';
  isTimeBased: boolean;
  basePoints: string;
  starPenalty: string;
  icon: string;
};

const EMPTY_FORM: TaskForm = {
  name: '',
  kind: 'GOOD',
  isTimeBased: false,
  basePoints: '10',
  starPenalty: '50',
  icon: '',
};

type Props = {
  googleUser: { email: string; name: string; picture: string };
  onSignOut: () => Promise<void>;
};

export function ProfileScreen({ googleUser, onSignOut }: Props) {
  const userId = useAuthUser();
  const { data: tasks } = useTodayTasks(userId);
  const { data: weekly } = useWeeklySummary(userId);
  const { data: daily } = useDailySummary(userId);
  const { data: fundBalance = 0 } = useFundBalance(userId);
  const createTask = useCreateTask(userId);
  const updateTask = useUpdateTask(userId);
  const archiveTask = useArchiveTask(userId);
  const { data: categories = [] } = useCategories(userId);
  const archiveCategory = useArchiveCategory(userId);

  const { data: savedNotifTime } = useNotificationTime(userId);
  const setNotifTimeMutation = useSetNotificationTime(userId);
  const [notifInput, setNotifInput] = useState('');
  const [savingNotif, setSavingNotif] = useState(false);

  useEffect(() => {
    setNotifInput(savedNotifTime ?? '');
  }, [savedNotifTime]);

  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);

  const weeklyStars = weekly?.weekly_stars ?? 0;
  const streak = daily?.streak_count ?? 0;

  function openCreate() {
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function openEdit(task: Task) {
    setForm({
      id: task.id,
      name: task.name,
      kind: task.kind as 'GOOD' | 'BAD',
      isTimeBased: !!task.is_time_based,
      basePoints: String(task.base_points),
      starPenalty: String(task.star_penalty),
      icon: task.icon ?? '',
    });
    setModalVisible(true);
  }

  async function handleSave() {
    const name = form.name.trim();
    if (!name) { Alert.alert('Name required'); return; }
    const basePoints = parseInt(form.basePoints, 10);
    const starPenalty = parseInt(form.starPenalty, 10);
    if (isNaN(basePoints) || basePoints < 1) { Alert.alert('Base points must be ≥ 1'); return; }
    if (form.kind === 'BAD' && (isNaN(starPenalty) || starPenalty < 1)) { Alert.alert('Star penalty must be ≥ 1'); return; }
    const params = {
      name,
      kind: form.kind,
      isTimeBased: form.isTimeBased,
      basePoints,
      starPenalty,
      icon: form.icon.trim() || undefined,
    };
    try {
      if (form.id !== undefined) {
        await updateTask.mutateAsync({ ...params, id: form.id });
      } else {
        await createTask.mutateAsync(params);
      }
      setModalVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to save task');
    }
  }

  function handleArchive(task: Task) {
    Alert.alert('Archive Task', `Archive "${task.name}"? It won't appear in Today.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive', style: 'destructive',
        onPress: () => archiveTask.mutateAsync(task.id).catch(() => Alert.alert('Error', 'Failed to archive')),
      },
    ]);
  }

  function handleArchiveCategory(cat: { id: number; name: string }) {
    Alert.alert(
      'Ẩn danh mục',
      `Ẩn danh mục "${cat.name}"? Danh mục sẽ không xuất hiện trong bộ lọc.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Ẩn',
          style: 'destructive',
          onPress: () =>
            archiveCategory.mutateAsync(cat.id).catch(() =>
              Alert.alert('Lỗi', 'Không thể ẩn danh mục.'),
            ),
        },
      ],
    );
  }

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
          <Text style={ph.lifeL}>Tổng Sao</Text>
        </View>
        <View style={[ph.lifeCell, ph.lifeDivider]}>
          <Text style={ph.lifeV}>{streak} 🔥</Text>
          <Text style={ph.lifeL}>Streak</Text>
        </View>
        <View style={ph.lifeCell}>
          <Text style={ph.lifeV}>₫{Math.round(fundBalance / 1000)}k</Text>
          <Text style={ph.lifeL}>Quỹ thưởng</Text>
        </View>
      </View>

      {/* Settings */}
      <Text style={styles.sectionLabel}>CÀI ĐẶT</Text>
      <View style={styles.settingsCard}>
        {/* Notification setting row */}
        <View style={[styles.set, { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
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
        {/* Sign out */}
        <TouchableOpacity style={[styles.set, styles.setLast, styles.setDanger]} onPress={onSignOut} activeOpacity={0.8}>
          <Text style={styles.setIc}>↺</Text>
          <Text style={[styles.setSl, { color: Colors.danger }]}>Đăng xuất</Text>
          <Text style={styles.setChev}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Tasks section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Hoạt động</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Text style={styles.addBtnText}>+ Thêm</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.taskCard}>
        {(tasks ?? []).length === 0 ? (
          <Text style={styles.empty}>Chưa có hoạt động. Nhấn "+ Thêm" để tạo.</Text>
        ) : (
          (tasks ?? []).map((item, idx) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.row, idx === (tasks ?? []).length - 1 && styles.rowLast]}
              onPress={() => openEdit(item)}
            >
              <Text style={styles.icon}>{item.icon ?? (item.kind === 'GOOD' ? '✅' : '❌')}</Text>
              <View style={styles.rowBody}>
                <Text style={styles.taskName}>{item.name}</Text>
                <Text style={styles.taskMeta}>
                  {item.kind === 'BAD' ? 'Thói xấu' : 'Việc tốt'}
                  {' · '}
                  {item.is_time_based ? '1pt/30m' : `${item.base_points}pt`}
                </Text>
              </View>
              <TouchableOpacity style={styles.archiveBtn} onPress={() => handleArchive(item)}>
                <Text style={styles.archiveBtnText}>🗂</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Categories section */}
      {categories.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Danh mục</Text>
          <View style={styles.taskCard}>
            {categories.map((cat, idx) => (
              <View
                key={cat.id}
                style={[styles.row, idx === categories.length - 1 && styles.rowLast]}
              >
                <Text style={styles.icon}>{cat.icon ?? '🏷️'}</Text>
                <View style={styles.rowBody}>
                  <Text style={styles.taskName}>{cat.name}</Text>
                </View>
                <TouchableOpacity style={styles.archiveBtn} onPress={() => handleArchiveCategory(cat)}>
                  <Text style={styles.archiveBtnText}>🗂</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Create / Edit modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {form.id !== undefined ? 'Sửa hoạt động' : 'Hoạt động mới'}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Tên</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
                placeholder="Ví dụ: Đọc sách 30 phút"
                placeholderTextColor={Colors.faint}
                autoFocus
              />

              <Text style={styles.label}>Loại</Text>
              <View style={styles.kindRow}>
                {(['GOOD', 'BAD'] as const).map(k => (
                  <TouchableOpacity
                    key={k}
                    style={[styles.kindBtn, form.kind === k && styles.kindBtnActive]}
                    onPress={() => setForm(f => ({ ...f, kind: k }))}
                  >
                    <Text style={[styles.kindBtnText, form.kind === k && styles.kindBtnTextActive]}>
                      {k === 'GOOD' ? '✅ Tốt' : '❌ Xấu'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.label}>Theo thời gian (điểm/30 phút)?</Text>
                <Switch
                  value={form.isTimeBased}
                  onValueChange={v => setForm(f => ({ ...f, isTimeBased: v }))}
                  thumbColor={form.isTimeBased ? Colors.primary : Colors.faint}
                  trackColor={{ false: Colors.line2, true: Colors.primarySoft }}
                />
              </View>

              {!form.isTimeBased && form.kind === 'GOOD' && (
                <>
                  <Text style={styles.label}>Điểm cơ bản</Text>
                  <TextInput
                    style={styles.input}
                    value={form.basePoints}
                    onChangeText={v => setForm(f => ({ ...f, basePoints: v }))}
                    keyboardType="number-pad"
                    placeholderTextColor={Colors.faint}
                  />
                </>
              )}

              {form.kind === 'BAD' && (
                <>
                  <Text style={styles.label}>Phạt sao</Text>
                  <TextInput
                    style={styles.input}
                    value={form.starPenalty}
                    onChangeText={v => setForm(f => ({ ...f, starPenalty: v }))}
                    keyboardType="number-pad"
                    placeholderTextColor={Colors.faint}
                  />
                </>
              )}

              <Text style={styles.label}>Emoji (tuỳ chọn)</Text>
              <TextInput
                style={styles.input}
                value={form.icon}
                onChangeText={v => setForm(f => ({ ...f, icon: v }))}
                placeholder="Ví dụ: 📚"
                placeholderTextColor={Colors.faint}
              />

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Lưu</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.cancel}>Huỷ</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  setDanger: {},
  setIc: { fontSize: 18, width: 26, textAlign: 'center' },
  setSl: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.inkDark },
  setSv: { fontSize: 12.5, color: Colors.muted, fontWeight: '700' },
  setChev: { color: Colors.faint, fontSize: 18 },
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
  addBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radii.sm },
  addBtnText: { color: Colors.white, fontWeight: '700' },
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
  icon: { fontSize: 22, marginRight: 12 },
  rowBody: { flex: 1 },
  taskName: { fontSize: 14, color: Colors.inkDark, fontWeight: '600' },
  taskMeta: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  archiveBtn: { padding: 8 },
  archiveBtnText: { fontSize: 20 },
  empty: { textAlign: 'center', color: Colors.muted, marginTop: 24, marginBottom: 24, fontSize: 14, paddingHorizontal: 12 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: Colors.surface, paddingHorizontal: 24, paddingTop: 24,
    borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, maxHeight: '85%',
  },
  modalTitle: { fontSize: 19, fontWeight: '800', color: Colors.inkDark, marginBottom: 8 },
  label: { fontSize: 11.5, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: Colors.surface2, color: Colors.inkDark, padding: 13,
    borderRadius: Radii.md, fontSize: 14, borderWidth: 1.5, borderColor: Colors.line2,
  },
  kindRow: { flexDirection: 'row', gap: 12 },
  kindBtn: { flex: 0, padding: 10, paddingHorizontal: 20, borderRadius: Radii.sm, borderWidth: 1, borderColor: Colors.line2, alignItems: 'center' },
  kindBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  kindBtnText: { color: Colors.muted, fontWeight: '700' },
  kindBtnTextActive: { color: Colors.primaryPress },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  saveBtn: { backgroundColor: Colors.primary, padding: 15, borderRadius: Radii.md, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  saveBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  cancel: { textAlign: 'center', color: Colors.muted, paddingVertical: 12, marginBottom: 8 },
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
