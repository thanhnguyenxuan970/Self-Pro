import React, { useState, useRef } from 'react';
import {
  Modal, View, Text, FlatList, TouchableOpacity,
  Alert, StyleSheet, ActivityIndicator,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useTodayTasks, useLogTask } from '../queries/useToday';
import { useChipPresets, useDurationLogger } from '../queries/useDurationLogger';
import { playCelebration } from '../logic/celebrateSound';
import { useAuthUser } from '../hooks/useAuth';
import { Colors, Typography, Radii, Spacing, Shadows } from '../theme';
import { DurationChips } from '../components/DurationChips';

type Task = {
  id: number; name: string; kind: string;
  is_time_based: number; base_points: number;
  star_penalty: number; icon: string | null; category_id: number | null;
};

interface Props { visible: boolean; onClose: () => void; }

// Sub-component: chip-based logger for time-based tasks.
// Rendered as an overlay on top of the main sheet.
function TimedTaskLogger({
  task,
  userId,
  onSuccess,
  onCancel,
}: {
  task: Task;
  userId: number;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { data: chips = [] } = useChipPresets(userId, task.id);
  const { log, previewStars, isLogging } = useDurationLogger({
    userId,
    task,
    onSuccess: (minutes) => {
      playCelebration(minutes);
      Toast.show({
        type: 'success',
        text1: 'Đã ghi nhận! ✅',
        text2: task.name,
        visibilityTime: 2000,
      });
      onSuccess();
    },
    onError: () => Alert.alert('Lỗi', 'Không thể ghi nhận. Thử lại.'),
  });

  return (
    <View style={s.durationBg}>
      <TouchableOpacity style={s.durationBackdrop} onPress={onCancel} activeOpacity={1} />
      <View style={s.durationBox}>
        {isLogging ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: 24 }} />
        ) : (
          <DurationChips
            activityName={task.name}
            chips={chips}
            previewStars={previewStars}
            onLog={log}
          />
        )}
        <TouchableOpacity onPress={onCancel} style={s.durationCancelBtn}>
          <Text style={s.durationCancel}>Huỷ</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function LogActivitySheet({ visible, onClose }: Props) {
  const userId = useAuthUser();
  const { data: tasks = [], isLoading } = useTodayTasks(userId);
  const logTask = useLogTask(userId);
  const [durationTask, setDurationTask] = useState<Task | null>(null);
  const submittingRef = useRef(false);

  async function handleSimpleTask(task: Task) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await logTask.mutateAsync({
        taskTypeId: task.id,
        kind: task.kind as 'GOOD' | 'BAD',
        isTimeBased: false,
        basePoints: task.base_points,
        starPenalty: task.star_penalty,
      });
      playCelebration(0);
      Toast.show({
        type: 'success',
        text1: 'Đã ghi nhận! ✅',
        text2: task.name,
        visibilityTime: 2000,
      });
      handleClose();
    } catch {
      Alert.alert('Lỗi', 'Không thể ghi nhận. Thử lại.');
    } finally {
      submittingRef.current = false;
    }
  }

  function handleTaskPress(task: Task) {
    if (task.is_time_based) { setDurationTask(task); return; }
    handleSimpleTask(task);
  }

  function handleClose() { setDurationTask(null); onClose(); }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={s.backdropTouch} onPress={handleClose} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.title}>Ghi nhận hoạt động</Text>

          {isLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 24 }} />
          ) : tasks.length === 0 ? (
            <Text style={s.empty}>Chưa có hoạt động. Vào Hồ sơ để thêm.</Text>
          ) : (
            <FlatList
              data={tasks}
              keyExtractor={(t) => String(t.id)}
              style={s.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.row, item.kind === 'BAD' && s.badRow]}
                  onPress={() => handleTaskPress(item)}
                  disabled={logTask.isPending}
                >
                  <Text style={s.rowIcon}>{item.icon ?? (item.kind === 'GOOD' ? '✅' : '❌')}</Text>
                  <View style={s.rowBody}>
                    <Text style={s.rowName}>{item.name}</Text>
                    <Text style={s.rowMeta}>
                      {item.kind === 'GOOD'
                        ? item.is_time_based ? '1★/30ph · giảm sau 2h' : `+${item.base_points}pt`
                        : `-${item.star_penalty}⭐`}
                    </Text>
                  </View>
                  {!!item.is_time_based && <Text style={s.timeTag}>⏱</Text>}
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity style={s.cancelBtn} onPress={handleClose}>
            <Text style={s.cancelText}>Đóng</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!!durationTask && (
        <TimedTaskLogger
          task={durationTask}
          userId={userId}
          onSuccess={handleClose}
          onCancel={() => setDurationTask(null)}
        />
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop:        { flex: 1, justifyContent: 'flex-end' },
  backdropTouch:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
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
  list:            { flexGrow: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 14,
    borderBottomWidth: 1, borderColor: Colors.line,
  },
  badRow:          { backgroundColor: Colors.dangerSoft },
  rowIcon:         { fontSize: 24, marginRight: 12 },
  rowBody:         { flex: 1 },
  rowName:         { ...Typography.body, color: Colors.inkDark },
  rowMeta:         { ...Typography.caption, color: Colors.muted, marginTop: 2 },
  timeTag:         { fontSize: 18, marginLeft: 8 },
  empty: {
    textAlign: 'center', color: Colors.muted, marginVertical: 32,
    paddingHorizontal: Spacing.xl, fontSize: 14,
  },
  cancelBtn: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.sm, padding: 14,
    borderRadius: Radii.sm, backgroundColor: Colors.surface2,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.line,
  },
  cancelText:      { color: Colors.muted, fontWeight: '700' },
  durationBg:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' },
  durationBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  durationBox: {
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    borderTopLeftRadius: Radii.xxl,
    borderTopRightRadius: Radii.xxl,
    paddingBottom: 36,
    ...Shadows.hero,
  },
  durationCancelBtn: { marginTop: 4, alignItems: 'center' },
  durationCancel:  { color: Colors.muted, padding: 10, fontSize: 14 },
});
