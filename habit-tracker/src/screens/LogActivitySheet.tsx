import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Modal, View, Text, FlatList, TouchableOpacity, TextInput,
  Alert, StyleSheet, ActivityIndicator, Animated,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useTodayTasks, useLogTask } from '../queries/useToday';
import { useChipPresets, useDurationLogger } from '../queries/useDurationLogger';
import { cueModalOpen, cueModalClose } from '../audio/uiSounds';
import { useAuthUser } from '../hooks/useAuth';
import { Typography, Radii, Spacing, Shadows, AppColors } from '../config/theme';
import { DurationChips } from '../components/DurationChips';
import { useTheme, useTranslations } from '../hooks/useSettings';

type Task = {
  id: number; name: string; kind: string;
  is_time_based: number; base_points: number;
  star_penalty: number; icon: string | null; category_id: number | null;
};

interface Props { visible: boolean; onClose: () => void; }

function DurationStep({
  task, userId, onSuccess, onBack, colors, styles, t,
}: {
  task: Task; userId: number; onSuccess: () => void; onBack: () => void;
  colors: AppColors; styles: ReturnType<typeof makeStyles>;
  t: ReturnType<typeof useTranslations>;
}) {
  const { data: chips = [] } = useChipPresets(userId, task.id);
  const { log, previewStars, isLogging } = useDurationLogger({
    userId,
    task,
    onSuccess: () => {
      Toast.show({ type: 'success', text1: t.loggedOk, text2: task.name, visibilityTime: 2000 });
      onSuccess();
    },
    onError: () => Alert.alert(t.error, t.cantLog),
  });

  return (
    <View style={styles.stepContainer}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>{t.back}</Text>
      </TouchableOpacity>
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
    </View>
  );
}

function ConfirmStep({
  task, userId, onSuccess, onBack, colors, styles, t,
}: {
  task: Task; userId: number; onSuccess: () => void; onBack: () => void;
  colors: AppColors; styles: ReturnType<typeof makeStyles>;
  t: ReturnType<typeof useTranslations>;
}) {
  const logTask = useLogTask(userId);
  const submittingRef = useRef(false);

  async function handleConfirm() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await logTask.mutateAsync({
        taskTypeId: task.id,
        kind: 'GOOD',
        isTimeBased: false,
        basePoints: task.base_points,
        starPenalty: task.star_penalty,
      });
      Toast.show({ type: 'success', text1: t.loggedOk, text2: task.name, visibilityTime: 2000 });
      onSuccess();
    } catch {
      Alert.alert(t.error, t.cantLog);
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <View style={styles.stepContainer}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>{t.back}</Text>
      </TouchableOpacity>
      <Text style={styles.confirmTitle}>{task.name}</Text>
      <Text style={styles.confirmMeta}>+{task.base_points}pt</Text>
      <TouchableOpacity
        style={[styles.confirmBtn, logTask.isPending && styles.confirmBtnDisabled]}
        onPress={handleConfirm}
        disabled={logTask.isPending}
      >
        {logTask.isPending
          ? <ActivityIndicator color={colors.white} />
          : <Text style={styles.confirmBtnText}>{t.logNow}</Text>}
      </TouchableOpacity>
    </View>
  );
}

export function LogActivitySheet({ visible, onClose }: Props) {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data: tasks = [], isLoading } = useTodayTasks(userId);
  const [step, setStep] = useState<'name' | 'duration'>('name');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filterText, setFilterText] = useState('');

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

  const goodTasks = useMemo(() => tasks.filter(task => task.kind === 'GOOD'), [tasks]);

  const filteredTasks = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return q ? goodTasks.filter(task => task.name.toLowerCase().includes(q)) : goodTasks;
  }, [goodTasks, filterText]);

  function handleSelectTask(task: Task) {
    setSelectedTask(task);
    setStep('duration');
  }

  function handleBack() {
    setStep('name');
  }

  function handleClose() {
    cueModalClose();
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.spring(sheetTranslateY, { toValue: 300, tension: 120, friction: 12, useNativeDriver: true }),
    ]).start(() => {
      setStep('name');
      setSelectedTask(null);
      setFilterText('');
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

          {step === 'name' ? (
            <>
              <Text style={styles.title}>{t.logSheetTitle}</Text>
              <View style={styles.searchWrap}>
                <TextInput
                  style={styles.searchInput}
                  value={filterText}
                  onChangeText={setFilterText}
                  placeholder={t.searchActivities}
                  placeholderTextColor={colors.faint}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
              </View>
              {isLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
              ) : filteredTasks.length === 0 ? (
                <Text style={styles.empty}>{t.logEmpty}</Text>
              ) : (
                <FlatList
                  data={filteredTasks}
                  keyExtractor={(task) => String(task.id)}
                  style={styles.list}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.row, selectedTask?.id === item.id && styles.rowSelected]}
                      onPress={() => handleSelectTask(item)}
                    >
                      <View style={styles.rowBody}>
                        <Text style={styles.rowName}>{item.name}</Text>
                        <Text style={styles.rowMeta}>
                          {item.is_time_based ? t.logMeta1star30min : `+${item.base_points}pt`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}
              <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelText}>{t.close}</Text>
              </TouchableOpacity>
            </>
          ) : selectedTask ? (
            selectedTask.is_time_based ? (
              <DurationStep
                task={selectedTask}
                userId={userId}
                onSuccess={handleClose}
                onBack={handleBack}
                colors={colors}
                styles={styles}
                t={t}
              />
            ) : (
              <ConfirmStep
                task={selectedTask}
                userId={userId}
                onSuccess={handleClose}
                onBack={handleBack}
                colors={colors}
                styles={styles}
                t={t}
              />
            )
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end' },
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
    searchWrap: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderColor: C.line,
    },
    searchInput: {
      backgroundColor: C.surface2,
      color: C.inkDark,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: Radii.sm,
      fontSize: 15,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.line2,
    },
    list: { flexGrow: 0 },
    row: {
      paddingHorizontal: Spacing.lg, paddingVertical: 14,
      borderBottomWidth: 1, borderColor: C.line,
    },
    rowSelected: { backgroundColor: C.primarySoft },
    rowBody: { flex: 1 },
    rowName: { ...Typography.body, color: C.inkDark },
    rowMeta: { ...Typography.caption, color: C.muted, marginTop: 2 },
    empty: {
      textAlign: 'center', color: C.muted, marginVertical: 32,
      paddingHorizontal: Spacing.xl, fontSize: 14,
    },
    cancelBtn: {
      marginHorizontal: Spacing.lg, marginTop: Spacing.sm, padding: 14,
      borderRadius: Radii.sm, backgroundColor: C.surface2,
      alignItems: 'center', borderWidth: 1, borderColor: C.line,
    },
    cancelText: { color: C.muted, fontWeight: '700' },
    stepContainer: {
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.lg,
    },
    backBtn: {
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.xs,
    },
    backText: {
      ...Typography.body, color: C.primary, fontWeight: '600',
    },
    confirmTitle: {
      fontSize: 18, fontWeight: '700' as const, color: C.inkDark,
      marginTop: Spacing.sm, marginBottom: 4,
    },
    confirmMeta: {
      ...Typography.caption, color: C.muted,
      marginBottom: Spacing.lg,
    },
    confirmBtn: {
      backgroundColor: C.primary,
      borderRadius: Radii.sm,
      paddingVertical: 14,
      alignItems: 'center',
    },
    confirmBtnDisabled: { backgroundColor: C.line2 },
    confirmBtnText: { color: C.white, fontSize: 15, fontWeight: '700' },
  });
}
