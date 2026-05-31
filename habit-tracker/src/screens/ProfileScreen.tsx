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
import { USER_ID } from '../constants';

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
  const { data: tasks } = useTodayTasks(USER_ID);
  const { data: weekly } = useWeeklySummary(USER_ID);
  const { data: daily } = useDailySummary(USER_ID);
  const { data: fundBalance = 0 } = useFundBalance(USER_ID);
  const createTask = useCreateTask(USER_ID);
  const updateTask = useUpdateTask(USER_ID);
  const archiveTask = useArchiveTask(USER_ID);
  const { data: categories = [] } = useCategories(USER_ID);
  const archiveCategory = useArchiveCategory(USER_ID);

  const { data: savedNotifTime } = useNotificationTime(USER_ID);
  const setNotifTimeMutation = useSetNotificationTime(USER_ID);
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
    <View style={styles.container}>
      {/* Profile Header */}
      <View style={profileHeaderStyles.card}>
        {googleUser.picture ? (
          <Image
            source={{ uri: googleUser.picture }}
            style={profileHeaderStyles.avatar}
          />
        ) : (
          <View style={[profileHeaderStyles.avatar, profileHeaderStyles.avatarPlaceholder]}>
            <Text style={profileHeaderStyles.avatarInitial}>
              {googleUser.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={profileHeaderStyles.info}>
          <Text style={profileHeaderStyles.name}>{googleUser.name}</Text>
          <Text style={profileHeaderStyles.email}>{googleUser.email}</Text>
          <Text style={profileHeaderStyles.meta}>
            {weeklyStars} ★  ·  {streak} 🔥  ·  ₫{fundBalance.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Settings */}
      <Text style={styles.sectionLabel}>CÀI ĐẶT</Text>
      <View style={settingsStyles.notifRow}>
        <Text style={settingsStyles.label}>🔔 Nhắc nhở hằng ngày</Text>
        <View style={settingsStyles.notifInputRow}>
          <TextInput
            style={settingsStyles.notifInput}
            value={notifInput}
            onChangeText={setNotifInput}
            placeholder="HH:MM (vd: 08:00)"
            placeholderTextColor={Colors.faint}
            keyboardType="numbers-and-punctuation"
          />
          <TouchableOpacity
            style={[settingsStyles.notifBtn, savingNotif && { opacity: 0.5 }]}
            onPress={handleSaveNotif}
            disabled={savingNotif}
          >
            <Text style={settingsStyles.notifBtnText}>Lưu</Text>
          </TouchableOpacity>
        </View>
        {!!savedNotifTime && (
          <Text style={settingsStyles.notifCurrent}>Hiện tại: {savedNotifTime}</Text>
        )}
      </View>

      <TouchableOpacity style={settingsStyles.signOutBtn} onPress={onSignOut} activeOpacity={0.8}>
        <Text style={settingsStyles.signOutText}>Đăng xuất</Text>
      </TouchableOpacity>

      {/* Tasks section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Hoạt động</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Text style={styles.addBtnText}>+ Thêm</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={tasks ?? []}
        keyExtractor={t => String(t.id)}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => openEdit(item)}>
            <Text style={styles.icon}>{item.icon ?? (item.kind === 'GOOD' ? '✅' : '❌')}</Text>
            <View style={styles.rowBody}>
              <Text style={styles.taskName}>{item.name}</Text>
              <Text style={styles.taskMeta}>
                {item.kind}
                {' · '}
                {item.is_time_based ? '1pt/30m' : `${item.base_points}pt`}
                {item.kind === 'BAD' ? ` · −${item.star_penalty}⭐` : ''}
              </Text>
            </View>
            <TouchableOpacity style={styles.archiveBtn} onPress={() => handleArchive(item)}>
              <Text style={styles.archiveBtnText}>🗂</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Chưa có hoạt động. Nhấn "+ Thêm" để tạo.</Text>
        }
      />

      {/* Categories section */}
      {categories.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Danh mục</Text>
          </View>
          {categories.map((cat) => (
            <View key={cat.id} style={styles.row}>
              <Text style={styles.icon}>{cat.icon ?? '🏷️'}</Text>
              <View style={styles.rowBody}>
                <Text style={styles.taskName}>{cat.name}</Text>
              </View>
              <TouchableOpacity style={styles.archiveBtn} onPress={() => handleArchiveCategory(cat)}>
                <Text style={styles.archiveBtnText}>🗂</Text>
              </TouchableOpacity>
            </View>
          ))}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgBase },
  sectionLabel: {
    ...Typography.sectionLabel, color: Colors.muted,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.xs, marginTop: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  sectionTitle: { ...Typography.bodyStrong, color: Colors.inkDark },
  addBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radii.sm },
  addBtnText: { color: Colors.white, fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderColor: Colors.line,
  },
  icon: { fontSize: 22, marginRight: 12 },
  rowBody: { flex: 1 },
  taskName: { ...Typography.body, color: Colors.inkDark },
  taskMeta: { ...Typography.caption, color: Colors.muted, marginTop: 2 },
  archiveBtn: { padding: 8 },
  archiveBtnText: { fontSize: 20 },
  empty: { textAlign: 'center', color: Colors.muted, marginTop: 40, fontSize: 15 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: Colors.surface, paddingHorizontal: 24, paddingTop: 24,
    borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, maxHeight: '85%',
  },
  modalTitle: { ...Typography.title, color: Colors.inkDark, marginBottom: 8 },
  label: { ...Typography.sectionLabel, color: Colors.muted, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: Colors.surface2, color: Colors.inkDark, padding: 12,
    borderRadius: Radii.sm, fontSize: 16, borderWidth: 1, borderColor: Colors.line,
  },
  kindRow: { flexDirection: 'row', gap: 12 },
  kindBtn: { flex: 1, padding: 12, borderRadius: Radii.sm, borderWidth: 1, borderColor: Colors.line2, alignItems: 'center' },
  kindBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  kindBtnText: { color: Colors.muted, fontWeight: '700' },
  kindBtnTextActive: { color: Colors.primaryPress },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  saveBtn: { backgroundColor: Colors.primary, padding: 14, borderRadius: Radii.sm, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  saveBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  cancel: { textAlign: 'center', color: Colors.muted, paddingVertical: 12, marginBottom: 8 },
});

const profileHeaderStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    margin: Spacing.lg,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    ...Shadows.light,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: Spacing.md,
    backgroundColor: Colors.primarySoft,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.primary,
  },
  info: { flex: 1 },
  name: { ...Typography.bodyStrong, color: Colors.inkDark },
  email: { ...Typography.caption, color: Colors.muted, marginBottom: 2 },
  meta: { ...Typography.caption, color: Colors.muted, marginTop: 2 },
});

const settingsStyles = StyleSheet.create({
  notifRow: {
    backgroundColor: Colors.surface, marginHorizontal: Spacing.lg,
    borderRadius: Radii.sm, padding: Spacing.sm, marginBottom: Spacing.xs,
    borderWidth: 1, borderColor: Colors.line,
  },
  notifInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  notifInput: {
    flex: 1, backgroundColor: Colors.surface2, color: Colors.inkDark,
    padding: 10, borderRadius: Radii.sm, fontSize: 15,
    borderWidth: 1, borderColor: Colors.line,
  },
  notifBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: Radii.sm,
  },
  notifBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  notifCurrent: { ...Typography.caption, color: Colors.muted, marginTop: 6 },
  label: { ...Typography.body, color: Colors.inkDark },
  signOutBtn: {
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.lg,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  signOutText: { color: Colors.danger, fontWeight: '600', fontSize: 14 },
});
