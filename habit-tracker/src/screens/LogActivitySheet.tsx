import React, { useState, useRef } from 'react';
import {
  Modal, View, Text, FlatList, TouchableOpacity,
  TextInput, Alert, StyleSheet, ActivityIndicator,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useTodayTasks, useLogTask } from '../queries/useToday';
import { playCelebration } from '../logic/celebrateSound';
import { USER_ID } from '../constants';
import { Colors, Typography, Radii, Spacing, Shadows } from '../theme';

type Task = {
  id: number; name: string; kind: string;
  is_time_based: number; base_points: number;
  star_penalty: number; icon: string | null; category_id: number | null;
};

interface Props { visible: boolean; onClose: () => void; }

export function LogActivitySheet({ visible, onClose }: Props) {
  const { data: tasks = [], isLoading } = useTodayTasks(USER_ID);
  const logTask = useLogTask(USER_ID);
  const [durationTask, setDurationTask] = useState<Task | null>(null);
  const [duration, setDuration] = useState('');
  const submittingRef = useRef(false);

  function handleTaskPress(task: Task) {
    if (task.is_time_based) { setDurationTask(task); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;
    submitLog(task, undefined).finally(() => { submittingRef.current = false; });
  }

  async function submitLog(task: Task, durationMin: number | undefined) {
    try {
      await logTask.mutateAsync({
        taskTypeId: task.id,
        kind: task.kind as 'GOOD' | 'BAD',
        isTimeBased: !!task.is_time_based,
        basePoints: task.base_points,
        starPenalty: task.star_penalty,
        durationMin,
      });
      playCelebration(durationMin ?? 0);
      Toast.show({
        type: 'success',
        text1: 'Đã ghi nhận! ✅',
        text2: task.name,
        visibilityTime: 2000,
      });
      onClose();
    } catch {
      Alert.alert('Lỗi', 'Không thể ghi nhận. Thử lại.');
    }
  }

  async function handleLogTime() {
    if (!durationTask) return;
    const mins = parseInt(duration, 10);
    if (isNaN(mins) || mins <= 0) { Alert.alert('Nhập số phút hợp lệ'); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await submitLog(durationTask, mins);
      setDurationTask(null);
      setDuration('');
    } finally {
      submittingRef.current = false;
    }
  }

  function handleClose() { setDurationTask(null); setDuration(''); onClose(); }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Ghi nhận hoạt động</Text>

          {isLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 24 }} />
          ) : tasks.length === 0 ? (
            <Text style={styles.empty}>Chưa có hoạt động. Vào Hồ sơ để thêm.</Text>
          ) : (
            <FlatList
              data={tasks}
              keyExtractor={(t) => String(t.id)}
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.row, item.kind === 'BAD' && styles.badRow]}
                  onPress={() => handleTaskPress(item)}
                  disabled={logTask.isPending}
                >
                  <Text style={styles.rowIcon}>{item.icon ?? (item.kind === 'GOOD' ? '✅' : '❌')}</Text>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    <Text style={styles.rowMeta}>
                      {item.kind === 'GOOD'
                        ? item.is_time_based ? '+1pt / 30min' : `+${item.base_points}pt`
                        : `-${item.star_penalty}⭐`}
                    </Text>
                  </View>
                  {!!item.is_time_based && <Text style={styles.timeTag}>⏱</Text>}
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
            <Text style={styles.cancelText}>Đóng</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!!durationTask && (
        <View style={styles.durationBg}>
          <View style={styles.durationBox}>
            <Text style={styles.durationTitle}>Bao nhiêu phút?</Text>
            <Text style={styles.durationSub}>{durationTask?.name}</Text>
            <TextInput
              style={styles.durationInput}
              keyboardType="number-pad"
              value={duration}
              onChangeText={setDuration}
              placeholder="Ví dụ: 45"
              autoFocus
            />
            <TouchableOpacity style={styles.durationBtn} onPress={handleLogTime}>
              <Text style={styles.durationBtnText}>Ghi nhận</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setDurationTask(null); setDuration(''); }}>
              <Text style={styles.durationCancel}>Huỷ</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropTouch: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radii.xxl,
    borderTopRightRadius: Radii.xxl,
    paddingBottom: 32,
    maxHeight: '80%',
    ...Shadows.hero,
  },
  handle: {
    width: 40, height: 4, backgroundColor: Colors.line2,
    borderRadius: Radii.pill, alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  title: {
    ...Typography.bodyStrong, color: Colors.inkDark, textAlign: 'center',
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1, borderColor: Colors.line,
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 14,
    borderBottomWidth: 1, borderColor: Colors.line,
  },
  badRow: { backgroundColor: Colors.dangerSoft },
  rowIcon: { fontSize: 24, marginRight: 12 },
  rowBody: { flex: 1 },
  rowName: { ...Typography.body, color: Colors.inkDark },
  rowMeta: { ...Typography.caption, color: Colors.muted, marginTop: 2 },
  timeTag: { fontSize: 18, marginLeft: 8 },
  empty: { textAlign: 'center', color: Colors.muted, marginVertical: 32, paddingHorizontal: Spacing.xl, fontSize: 14 },
  cancelBtn: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.sm, padding: 14,
    borderRadius: Radii.sm, backgroundColor: Colors.surface2,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.line,
  },
  cancelText: { color: Colors.muted, fontWeight: '700' },
  durationBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  durationBox: { backgroundColor: Colors.surface, padding: Spacing.xl, borderRadius: Radii.xl, ...Shadows.medium },
  durationTitle: { ...Typography.title, color: Colors.inkDark, marginBottom: 4 },
  durationSub: { ...Typography.caption, color: Colors.muted, marginBottom: Spacing.md },
  durationInput: {
    backgroundColor: Colors.surface2, color: Colors.inkDark, padding: 12,
    borderRadius: Radii.sm, fontSize: 18, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.line,
  },
  durationBtn: { backgroundColor: Colors.primary, padding: 14, borderRadius: Radii.sm, alignItems: 'center', marginBottom: 8 },
  durationBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  durationCancel: { textAlign: 'center', color: Colors.muted, padding: 8 },
});
