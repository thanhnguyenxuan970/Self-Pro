import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Modal, View, Text, FlatList, TouchableOpacity,
  Alert, StyleSheet, ActivityIndicator, Animated,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useTodayTasks, useLogTask } from '../queries/useToday';
import { useChipPresets, useDurationLogger } from '../queries/useDurationLogger';
import { cueModalOpen, cueModalClose } from '../logic/uiSounds';
import { useAuthUser } from '../hooks/useAuth';
import { Typography, Radii, Spacing, Shadows, AppColors } from '../theme';
import { DurationChips } from '../components/DurationChips';
import { useTheme, useTranslations } from '../hooks/useSettings';

type Task = {
  id: number; name: string; kind: string;
  is_time_based: number; base_points: number;
  star_penalty: number; icon: string | null; category_id: number | null;
};

interface Props { visible: boolean; onClose: () => void; }

function TimedTaskLogger({
  task,
  userId,
  onSuccess,
  onCancel,
  colors,
  styles,
  t,
}: {
  task: Task;
  userId: number;
  onSuccess: () => void;
  onCancel: () => void;
  colors: AppColors;
  styles: ReturnType<typeof makeStyles>;
  t: ReturnType<typeof useTranslations>;
}) {
  const { data: chips = [] } = useChipPresets(userId, task.id);
  const { log, previewStars, isLogging } = useDurationLogger({
    userId,
    task,
    onSuccess: (_minutes) => {
      Toast.show({
        type: 'success',
        text1: t.loggedOk,
        text2: task.name,
        visibilityTime: 2000,
      });
      onSuccess();
    },
    onError: () => Alert.alert(t.error, t.cantLog),
  });

  return (
    <View style={styles.durationBg}>
      <TouchableOpacity style={styles.durationBackdrop} onPress={onCancel} activeOpacity={1} />
      <View style={styles.durationBox}>
        {isLogging ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
        ) : (
          <DurationChips
            activityName={task.name}
            chips={chips}
            previewStars={previewStars}
            onLog={log}
          />
        )}
        <TouchableOpacity onPress={onCancel} style={styles.durationCancelBtn}>
          <Text style={styles.durationCancel}>{t.cancel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function LogActivitySheet({ visible, onClose }: Props) {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data: tasks = [], isLoading } = useTodayTasks(userId);
  const logTask = useLogTask(userId);
  const [durationTask, setDurationTask] = useState<Task | null>(null);
  const submittingRef = useRef(false);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      cueModalOpen();
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(sheetTranslateY, { toValue: 0, tension: 120, friction: 12, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

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
      Toast.show({
        type: 'success',
        text1: t.loggedOk,
        text2: task.name,
        visibilityTime: 2000,
      });
      handleClose();
    } catch {
      Alert.alert(t.error, t.cantLog);
    } finally {
      submittingRef.current = false;
    }
  }

  function handleTaskPress(task: Task) {
    if (task.is_time_based) { setDurationTask(task); return; }
    handleSimpleTask(task);
  }

  function handleClose() {
    cueModalClose();
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.spring(sheetTranslateY, { toValue: 300, tension: 120, friction: 12, useNativeDriver: true }),
    ]).start(() => {
      setDurationTask(null);
      onClose();
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(300);
    });
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: backdropOpacity }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1} />
        </Animated.View>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t.logSheetTitle}</Text>

          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : tasks.length === 0 ? (
            <Text style={styles.empty}>{t.logEmpty}</Text>
          ) : (
            <FlatList
              data={tasks}
              keyExtractor={(task) => String(task.id)}
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
                        ? item.is_time_based ? t.logMeta1star30min : `+${item.base_points}pt`
                        : `-${item.star_penalty}⭐`}
                    </Text>
                  </View>
                  {!!item.is_time_based && <Text style={styles.timeTag}>⏱</Text>}
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
            <Text style={styles.cancelText}>{t.close}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {!!durationTask && (
        <TimedTaskLogger
          task={durationTask}
          userId={userId}
          onSuccess={handleClose}
          onCancel={() => setDurationTask(null)}
          colors={colors}
          styles={styles}
          t={t}
        />
      )}
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    backdrop:        { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: Radii.xxl,
      borderTopRightRadius: Radii.xxl,
      paddingBottom: 32,
      maxHeight: '80%',
      ...Shadows.hero,
    },
    handle: {
      width: 40, height: 4, backgroundColor: C.line2,
      borderRadius: Radii.pill, alignSelf: 'center', marginTop: 10, marginBottom: 4,
    },
    title: {
      ...Typography.bodyStrong, color: C.inkDark, textAlign: 'center',
      paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
      borderBottomWidth: 1, borderColor: C.line,
    },
    list:            { flexGrow: 0 },
    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: Spacing.lg, paddingVertical: 14,
      borderBottomWidth: 1, borderColor: C.line,
    },
    badRow:          { backgroundColor: C.dangerSoft },
    rowIcon:         { fontSize: 24, marginRight: 12 },
    rowBody:         { flex: 1 },
    rowName:         { ...Typography.body, color: C.inkDark },
    rowMeta:         { ...Typography.caption, color: C.muted, marginTop: 2 },
    timeTag:         { fontSize: 18, marginLeft: 8 },
    empty: {
      textAlign: 'center', color: C.muted, marginVertical: 32,
      paddingHorizontal: Spacing.xl, fontSize: 14,
    },
    cancelBtn: {
      marginHorizontal: Spacing.lg, marginTop: Spacing.sm, padding: 14,
      borderRadius: Radii.sm, backgroundColor: C.surface2,
      alignItems: 'center', borderWidth: 1, borderColor: C.line,
    },
    cancelText:      { color: C.muted, fontWeight: '700' },
    durationBg:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' },
    durationBackdrop: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    durationBox: {
      backgroundColor: C.surface,
      padding: Spacing.xl,
      borderTopLeftRadius: Radii.xxl,
      borderTopRightRadius: Radii.xxl,
      paddingBottom: 36,
      ...Shadows.hero,
    },
    durationCancelBtn: { marginTop: 4, alignItems: 'center' },
    durationCancel:  { color: C.muted, padding: 10, fontSize: 14 },
  });
}
