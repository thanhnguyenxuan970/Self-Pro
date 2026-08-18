import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  Alert, StyleSheet, ActivityIndicator, Animated, useWindowDimensions, ScrollView,
  KeyboardAvoidingView, Keyboard, Platform,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActivityPickerTasks, useCreateTask, useRestoreTask, useSetTaskPinned } from '../queries/useTasks';
import { useLogTask } from '../queries/useToday';
import { cueModalOpen, cueModalClose } from '../audio/uiSounds';
import { useAuthUser } from '../hooks/useAuth';
import { Typography, Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { TEMPLATE_CATEGORIES, TemplateTask } from '../config/constants';
import { Strings } from '../config/i18n';
import { resolveTaskDisplayName } from '../utils/resolveTaskDisplayName';
import { activityGroup, activityMatches, activityPinAccessibilityLabel, MAX_PINNED_ACTIVITIES, normalizeActivityName, PickerTask, resolvePresetTask } from '../utils/activityPicker';
import { DurationClockInput } from '../components/DurationClockInput';
import { DurationPresetChips } from '../components/DurationPresetChips';
import { clockMinutes } from '../utils/durationClock';

interface Props { visible: boolean; onClose: () => void; presetName?: string | null; presetTaskId?: number | null; }

type SuggestionChipProps = {
  s: TemplateTask;
  isSelected: boolean;
  onPress: (s: TemplateTask) => void;
  t: Record<string, unknown>;
  styles: ReturnType<typeof makeStyles>;
};

const SuggestionChip = React.memo(function SuggestionChip({ s, isSelected, onPress, t, styles }: SuggestionChipProps) {
  const label = (t[s.nameKey] as string) ?? s.name;
  return (
    <TouchableOpacity
      key={s.nameKey}
      style={[styles.chip, isSelected && styles.chipSelected]}
      onPress={() => onPress(s)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
    >
      <Text style={[styles.chipName, isSelected && styles.chipNameSelected]}>
        {s.icon ? `${s.icon} ${label}` : label}
      </Text>
    </TouchableOpacity>
  );
});

const PickerTaskRow = React.memo(function PickerTaskRow({ task, onPress, onPin, styles, t }: {
  task: PickerTask; onPress: (task: PickerTask) => void; onPin: (task: PickerTask) => void; styles: ReturnType<typeof makeStyles>; t: Strings;
}) {
  const taskLabel = resolveTaskDisplayName(task.name, t, task.is_template === 1);
  return <View style={styles.pickerRow}>
    <TouchableOpacity style={styles.pickerTask} onPress={() => onPress(task)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={taskLabel}>
      <Text style={styles.pickerTaskName} numberOfLines={1}>{task.icon ? `${task.icon} ` : ''}{taskLabel}</Text>
      {task.archived === 1 ? <Text style={styles.hiddenBadge}>{t.activityHidden}</Text> : null}
    </TouchableOpacity>
    <TouchableOpacity style={styles.pinButton} onPress={() => onPin(task)} activeOpacity={0.7} hitSlop={4} accessibilityRole="button" accessibilityLabel={activityPinAccessibilityLabel(task.is_pinned === 1 ? t.activityUnpin : t.activityPin, taskLabel)} accessibilityState={{ selected: task.is_pinned === 1 }}>
      <Text style={[styles.pinText, task.is_pinned === 1 && styles.pinTextActive]}>{task.is_pinned === 1 ? '★' : '☆'}</Text>
    </TouchableOpacity>
  </View>;
});

type DurationStepProps = {
  pendingTaskName: string;
  isPending: boolean;
  onLogDuration: (mins: number) => void;
  onBack: () => void;
  onClose: () => void;
  t: Strings;
  colors: AppColors;
  styles: ReturnType<typeof makeStyles>;
};

function DurationStep({ pendingTaskName, isPending, onLogDuration, onBack, onClose, t, colors, styles }: DurationStepProps) {
  const [clock, setClock] = useState({ hours: 0, minutes: 0 });
  const [customDuration, setCustomDuration] = useState(false);

  function handleCustomLog() {
    const mins = clockMinutes(clock);
    if (mins <= 0) { Alert.alert(t.error, t.validDuration); return; }
    if (mins > 1440) { Alert.alert(t.error, t.maxDuration); return; }
    onLogDuration(mins);
  }

  const displayName = resolveTaskDisplayName(pendingTaskName, t);

  return (
    <ScrollView
      style={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
        <TouchableOpacity style={styles.backButton} onPress={onBack} accessibilityRole="button" accessibilityLabel={t.back}>
          <Text style={styles.backText}>{t.back}</Text>
        </TouchableOpacity>
        <Text style={styles.durationStepTitle}>{displayName}</Text>
        <Text style={[styles.durationLabel, { marginTop: 4 }]}>{t.addActivityHowLong}</Text>

        {!customDuration ? (
          <DurationPresetChips
            colors={colors}
            disabled={isPending}
            onSelectPreset={onLogDuration}
            onCustom={() => setCustomDuration(true)}
            customLabel={t.durationCustom}
            rowStyle={{ marginTop: Spacing.md }}
          />
        ) : (
          <>
            <DurationClockInput value={clock} onChange={setClock} colors={colors} />
            <TouchableOpacity style={styles.durationChip} onPress={handleCustomLog} disabled={isPending} accessibilityRole="button" accessibilityLabel={t.logBtn}>
              {isPending ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.durationChipText}>{t.logBtn}</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.noTimerBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel={t.cancel}>
          <Text style={styles.noTimerText}>{t.cancel}</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
  );
}

// fallow-ignore-next-line complexity
export function AddActivitySheet({ visible, onClose, presetName, presetTaskId }: Props) {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const reduceMotion = useReduceMotion();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, bottomInset), [colors, bottomInset]);
  const { height: sheetHiddenY } = useWindowDimensions();

  const createTask = useCreateTask(userId);
  const logTask = useLogTask(userId);
  const { data: pickerTasks = [] } = useActivityPickerTasks(userId);
  const setTaskPinned = useSetTaskPinned(userId);
  const restoreTask = useRestoreTask(userId);
  const { mutateAsync: setTaskPinnedMutateAsync } = setTaskPinned;
  const { mutateAsync: restoreTaskMutateAsync } = restoreTask;

  const [name, setName] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<TemplateTask | null>(null);
  const [selectedExistingTask, setSelectedExistingTask] = useState<PickerTask | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const submittingRef = useRef(false);

  type PendingTask = { id: number; name: string; basePoints: number; starPenalty: number; isTemplate: boolean };
  const [step, setStep] = useState<'create' | 'duration'>('create');
  const [pendingTask, setPendingTask] = useState<PendingTask | null>(null);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(sheetHiddenY)).current;

  useEffect(() => {
    if (visible && presetName) {
      setName(presetName);
      setSelectedSuggestion(null);
      // A preset name always names an existing task (e.g. a challenge's linked
      // habit) -- wire it up here so the duplicate-name guard in handleCreate
      // doesn't reject it as a name collision with itself. Prefer the exact
      // task id when the caller has it (e.g. challenge.taskTypeId): two tasks
      // can have different exact names that collide once normalized (accent/
      // case-insensitive), so a name-only lookup could resolve to the wrong
      // task and silently misattribute the log.
      setSelectedExistingTask(resolvePresetTask(pickerTasks, presetName, presetTaskId));
    }
  }, [visible, presetName, presetTaskId, pickerTasks]);

  useEffect(() => {
    if (visible) {
      cueModalOpen();
      if (reduceMotion) {
        backdropOpacity.setValue(1);
        sheetTranslateY.setValue(0);
        return;
      }
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(sheetTranslateY, { toValue: 0, tension: 120, friction: 12, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, reduceMotion]);

  function handleClose() {
    Keyboard.dismiss();
    cueModalClose();
    if (reduceMotion) {
      backdropOpacity.setValue(0);
        sheetTranslateY.setValue(sheetHiddenY);
      setName('');
      setSelectedSuggestion(null);
      setSelectedExistingTask(null);
      setStep('create');
      setPendingTask(null);
      submittingRef.current = false;
      onClose();
      return;
    }
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetTranslateY, { toValue: sheetHiddenY, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setName('');
      setSelectedSuggestion(null);
      setSelectedExistingTask(null);
      setStep('create');
      setPendingTask(null);
      submittingRef.current = false;
      onClose();
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(sheetHiddenY);
    });
  }

  const handleSuggestionTap = useCallback((task: TemplateTask) => {
    setName((t as Record<string, unknown>)[task.nameKey] as string ?? task.name);
    setSelectedSuggestion(task);
    setSelectedExistingTask(null);
  }, [t]);

  const handlePickerTask = useCallback(async (task: PickerTask) => {
    if (task.archived === 1) await restoreTaskMutateAsync(task.id);
    setName(task.name);
    setSelectedSuggestion(null);
    setSelectedExistingTask({ ...task, archived: 0 });
  }, [restoreTaskMutateAsync]);

  const handlePin = useCallback(async (task: PickerTask) => {
    try {
      await setTaskPinnedMutateAsync({ taskId: task.id, pinned: task.is_pinned === 0 });
    } catch (error) {
      if (error instanceof Error && error.message === 'PIN_LIMIT') Alert.alert(t.error, t.activityPinLimit);
    }
  }, [setTaskPinnedMutateAsync, t]);

  function renderPickerTaskRow(task: PickerTask) {
    return <PickerTaskRow key={task.id} task={task} onPress={handlePickerTask} onPin={handlePin} styles={styles} t={t} />;
  }

  // fallow-ignore-next-line complexity
  async function handleCreate(isTimeBased: boolean) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const trimmed = name.trim();
    if (!trimmed) { submittingRef.current = false; return; }

    // Store canonical (Vietnamese) name for template suggestions so the reverse-lookup
    // in TaskRow can translate it to any language. Only use canonical when the user
    // hasn't edited the name away from the suggestion label.
    const currentLabel = selectedSuggestion
      ? ((t as Record<string, unknown>)[selectedSuggestion.nameKey] as string ?? selectedSuggestion.name)
      : null;
    let storeName = selectedExistingTask?.name ?? ((selectedSuggestion && trimmed === currentLabel)
      ? selectedSuggestion.name
      : trimmed);

    const duplicate = pickerTasks.find(task => normalizeActivityName(task.name) === normalizeActivityName(storeName));
    if (duplicate && duplicate.id !== selectedExistingTask?.id) {
      Alert.alert(t.error, t.activityDuplicate);
      submittingRef.current = false;
      return;
    }

    const taskBasePoints = isTimeBased
      ? (selectedExistingTask?.base_points ?? selectedSuggestion?.basePoints ?? 1)
      : (selectedExistingTask?.base_points ?? selectedSuggestion?.basePoints ?? 5);

    try {
      const taskId = await createTask.mutateAsync({
        name: storeName,
        kind: 'GOOD',
        isTimeBased,
        basePoints: taskBasePoints,
        starPenalty: 0,
        icon: selectedExistingTask?.icon ?? selectedSuggestion?.icon,
        isTemplate: !!selectedSuggestion,
      });

      if (isTimeBased) {
        Keyboard.dismiss();
        setPendingTask({ id: taskId, name: storeName, basePoints: taskBasePoints, starPenalty: 0, isTemplate: !!selectedSuggestion });
        setStep('duration');
        submittingRef.current = false;
      } else {
        Toast.show({ type: 'success', text1: t.taskAdded, text2: resolveTaskDisplayName(storeName, t, !!selectedSuggestion), visibilityTime: 2000 });
        handleClose();
      }
    } catch (e: any) {
      Alert.alert(t.error, e?.message === 'DUPLICATE_ACTIVITY_NAME' ? t.activityDuplicate : t.cantLog);
      submittingRef.current = false;
    }
  }

  async function handleLogDuration(mins: number) {
    if (!pendingTask) return;
    try {
      await logTask.mutateAsync({
        taskTypeId: pendingTask.id,
        kind: 'GOOD',
        isTimeBased: true,
        basePoints: pendingTask.basePoints,
        starPenalty: pendingTask.starPenalty,
        durationMin: mins,
      });
      Toast.show({ type: 'success', text1: t.taskAdded, text2: resolveTaskDisplayName(pendingTask.name, t, pendingTask.isTemplate), visibilityTime: 2000 });
      handleClose();
    } catch {
      Alert.alert(t.error, t.cantLog);
    }
  }

  function handleBackToCreate() {
    Keyboard.dismiss();
    setPendingTask(null);
    setStep('create');
  }

  const suggestions = useMemo(() => TEMPLATE_CATEGORIES.flatMap(c => c.tasks), []);
  const query = name.trim();
  const activePickerTasks = useMemo(() => pickerTasks.filter(task => task.archived === 0), [pickerTasks]);
  const pinnedTasks = useMemo(() => activePickerTasks.filter(task => task.is_pinned === 1), [activePickerTasks]);
  const recentTasks = useMemo(() => activePickerTasks.filter(task => task.is_pinned === 0 && task.last_used_date !== null), [activePickerTasks]);
  const searchTasks = useMemo(() => query ? pickerTasks.filter(task => activityMatches(task, query)) : [], [pickerTasks, query]);
  const matchingSuggestions = useMemo(() => suggestions.filter(task => activityMatches(task, query)), [suggestions, query]);
  const groupedTasks = useMemo(() => activePickerTasks.reduce<Record<string, PickerTask[]>>((groups, task) => {
    const group = activityGroup(task.name);
    (groups[group] ??= []).push(task);
    return groups;
  }, {}), [activePickerTasks]);

  const hasName = name.trim().length > 0;
  const isPending = createTask.isPending || logTask.isPending;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.backdrop}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: backdropOpacity }]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel={t.cancel}
          />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>

          {step === 'create' ? (
            <>
              <Text style={styles.title}>{t.addActivityTitle}</Text>
              <ScrollView
                style={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={text => { setName(text); setSelectedSuggestion(null); setSelectedExistingTask(null); }}
                  placeholder={t.addActivityNamePlaceholder}
                  placeholderTextColor={colors.faint}
                  returnKeyType="done"
                  maxLength={50}
                  editable={presetName == null}
                  accessibilityLabel={t.addActivityNameLabel}
                />

                {presetName == null && query.length > 0 && (
                  <>
                    <Text style={styles.suggestionsLabel}>{t.activitySearch}</Text>
                    {searchTasks.map(renderPickerTaskRow)}
                    <View style={styles.chipsWrap}>{matchingSuggestions.map(task => { const label = (t as Record<string, unknown>)[task.nameKey] as string ?? task.name; return <SuggestionChip key={task.nameKey} s={task} isSelected={name === label} onPress={handleSuggestionTap} t={t as Record<string, unknown>} styles={styles} />; })}</View>
                  </>
                )}

                {presetName == null && query.length === 0 && pinnedTasks.length > 0 && (
                  <>
                    <View style={styles.sectionHeader}><Text style={styles.suggestionsLabel}>{t.activityPinned} · {pinnedTasks.length}/{MAX_PINNED_ACTIVITIES}</Text></View>
                    {pinnedTasks.map(renderPickerTaskRow)}
                  </>
                )}

                {presetName == null && query.length === 0 && recentTasks.length > 0 && (
                  <>
                    <Text style={styles.suggestionsLabel}>{t.activityRecent}</Text>
                    {recentTasks.slice(0, 6).map(renderPickerTaskRow)}
                  </>
                )}

                {presetName == null && query.length === 0 && activePickerTasks.length > 0 && (
                  <>
                    <TouchableOpacity style={styles.browseButton} onPress={() => setShowAll(value => !value)} accessibilityRole="button" accessibilityLabel={showAll ? t.activityHideAll : t.activityBrowseAll} accessibilityState={{ expanded: showAll }}><Text style={styles.browseText}>{showAll ? t.activityHideAll : t.activityBrowseAll}</Text></TouchableOpacity>
                    {showAll && Object.entries(groupedTasks).map(([group, tasks]) => <View key={group}>
                      <TouchableOpacity style={styles.groupHeader} onPress={() => setCollapsedGroups(value => ({ ...value, [group]: !value[group] }))} accessibilityRole="button" accessibilityLabel={group} accessibilityState={{ expanded: !collapsedGroups[group] }}><Text style={styles.groupTitle}>{group}</Text><Text style={styles.groupToggle}>{collapsedGroups[group] ? '⌄' : '⌃'}</Text></TouchableOpacity>
                      {!collapsedGroups[group] && tasks.map(renderPickerTaskRow)}
                    </View>)}
                  </>
                )}

                {presetName == null && query.length === 0 && activePickerTasks.length === 0 && suggestions.length > 0 && (
                  <>
                    <Text style={styles.suggestionsLabel}>{t.addActivitySuggestionsTitle}</Text>
                    <View style={styles.chipsWrap}>
                      {suggestions.map(s => {
                        const label = (t as Record<string, unknown>)[s.nameKey] as string ?? s.name;
                        return (
                          <SuggestionChip
                            key={s.nameKey}
                            s={s}
                            isSelected={name === label}
                            onPress={handleSuggestionTap}
                            t={t as Record<string, unknown>}
                            styles={styles}
                          />
                        );
                      })}
                    </View>
                  </>
                )}

                <Text style={[styles.durationLabel, !hasName && styles.durationLabelDim]}>
                  {t.addActivityHowLong}
                </Text>
                {!hasName && (
                  <Text style={styles.durationHint}>{t.addActivityEmptyName}</Text>
                )}

                <TouchableOpacity
                  style={[styles.durationChip, !hasName && styles.durationChipDim]}
                  onPress={() => handleCreate(true)}
                  disabled={!hasName || isPending}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t.addActivityTimedBtn}
                  accessibilityState={{ disabled: !hasName || isPending }}
                >
                  {createTask.isPending ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <Text style={styles.durationChipText}>{t.addActivityTimedBtn}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.noTimerBtn, !hasName && styles.noTimerBtnDisabled]}
                  onPress={() => handleCreate(false)}
                  disabled={!hasName || isPending}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t.addActivityNoTimer}
                  accessibilityState={{ disabled: !hasName || isPending }}
                >
                  <Text style={[styles.noTimerText, !hasName && styles.noTimerTextDim]}>
                    {t.addActivityNoTimer}
                  </Text>
                </TouchableOpacity>

                <View style={{ height: 32 }} />
              </ScrollView>
            </>
          ) : (
            <DurationStep
              pendingTaskName={pendingTask?.name ?? ''}
              isPending={isPending}
              onLogDuration={handleLogDuration}
              onBack={handleBackToCreate}
              onClose={handleClose}
              t={t}
              colors={colors}
              styles={styles}
            />
          )}
        </Animated.View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(C: AppColors, bottomInset: number) {
  return StyleSheet.create({
    kav: { flex: 1 },
    backdrop: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl,
      paddingBottom: Math.max(Spacing.md, bottomInset),
      maxHeight: '80%', alignSelf: 'center', width: '100%', maxWidth: 480,
      ...Shadows.hero,
      shadowColor: C.primary,
    },
    title: {
      ...Typography.bodyStrong, color: C.inkDark, textAlign: 'center',
      paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
      borderBottomWidth: 1, borderColor: C.line,
    },
    scroll: { paddingHorizontal: Spacing.lg },
    input: {
      backgroundColor: C.surface2, color: C.inkDark, padding: 13,
      borderRadius: Radii.md, fontSize: 14,
      borderWidth: 1.5, borderColor: C.line2,
      marginTop: Spacing.md,
    },
    suggestionsLabel: {
      fontSize: 12, fontFamily: FontFamily.semiBold, color: C.ink2,
      marginTop: Spacing.xl, marginBottom: 10,
    },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center' },
    pickerRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line },
    pickerTask: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: Spacing.sm },
    pickerTaskName: { flexShrink: 1, color: C.inkDark, fontSize: 14, fontFamily: FontFamily.semiBold },
    hiddenBadge: { color: C.muted, backgroundColor: C.surface2, borderRadius: Radii.pill, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3, fontSize: 9, fontFamily: FontFamily.extraBold },
    pinButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    pinText: { color: C.faint, fontSize: 22 }, pinTextActive: { color: C.starGoldText },
    browseButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.sm },
    browseText: { color: C.primaryText, fontFamily: FontFamily.bold, fontSize: 14 },
    groupHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
    groupTitle: { color: C.ink2, fontFamily: FontFamily.extraBold, fontSize: 12 }, groupToggle: { color: C.muted, fontSize: 16 },
    chip: {
      backgroundColor: C.surface2, borderRadius: Radii.pill,
      paddingVertical: 7, paddingHorizontal: 14,
      borderWidth: 1, borderColor: C.line2,
    },
    chipSelected: { borderColor: C.primary, backgroundColor: C.primarySoft },
    chipName: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.inkDark, lineHeight: 18 },
    chipNameSelected: { color: C.primaryText },
    durationLabel: {
      ...Typography.bodyStrong, color: C.inkDark,
      marginTop: Spacing.xl, marginBottom: Spacing.sm,
    },
    durationLabelDim: { color: C.muted },
    durationHint: {
      ...Typography.caption,
      color: C.muted,
      marginBottom: Spacing.sm,
    },
    durationChip: {
      backgroundColor: C.primary, borderRadius: Radii.md,
      paddingVertical: 13, paddingHorizontal: 20,
      alignItems: 'center', justifyContent: 'center',
    },
    durationChipDim: { backgroundColor: C.line2 },
    durationChipText: { color: C.onAccent, fontSize: 15, fontFamily: FontFamily.bold },
    noTimerBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
      marginTop: Spacing.sm,
      borderRadius: Radii.md,
      borderWidth: 1.5,
      borderColor: C.line2,
      backgroundColor: C.surface2,
    },
    noTimerBtnDisabled: {
      backgroundColor: C.surface,
      borderColor: C.line,
    },
    noTimerText: { ...Typography.bodyStrong, color: C.inkDark },
    noTimerTextDim: { color: C.faint },

    backButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginTop: Spacing.xs },
    backText: { color: C.primaryText, fontSize: 14, fontFamily: FontFamily.bold },
    durationStepTitle: { fontSize: 19, fontFamily: FontFamily.extraBold, color: C.inkDark, marginBottom: 2 },
  });
}
