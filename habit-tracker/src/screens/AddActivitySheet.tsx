import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  Alert, StyleSheet, ActivityIndicator, Animated, ScrollView,
  KeyboardAvoidingView, Keyboard,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useActivityPickerTasks, useCreateTask, useRestoreTask, useSetTaskPinned } from '../queries/useTasks';
import { useLogTask } from '../queries/useToday';
import { cueModalOpen, cueModalClose } from '../audio/uiSounds';
import { useAuthUser } from '../hooks/useAuth';
import { Typography, Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { useTheme, useTranslations, useLanguage } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { TEMPLATE_CATEGORIES, TemplateTask } from '../config/constants';
import { Strings } from '../config/i18n';
import { supabase } from '../api/supabase';
import { resolveTaskDisplayName } from '../utils/resolveTaskDisplayName';
import { activityGroup, activityMatches, MAX_PINNED_ACTIVITIES, normalizeActivityName, PickerTask } from '../utils/activityPicker';

interface Props { visible: boolean; onClose: () => void; presetName?: string | null; }

type SuggestionChipProps = {
  s: TemplateTask;
  isSelected: boolean;
  onPress: () => void;
  t: Record<string, unknown>;
  styles: ReturnType<typeof makeStyles>;
};

function SuggestionChip({ s, isSelected, onPress, t, styles }: SuggestionChipProps) {
  const label = (t[s.nameKey] as string) ?? s.name;
  return (
    <TouchableOpacity
      key={s.nameKey}
      style={[styles.chip, isSelected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
    >
      <Text style={[styles.chipName, isSelected && styles.chipNameSelected]}>
        {s.icon ? `${s.icon} ${label}` : label}
      </Text>
    </TouchableOpacity>
  );
}

function PickerTaskRow({ task, onPress, onPin, styles, t }: {
  task: PickerTask; onPress: () => void; onPin: () => void; styles: ReturnType<typeof makeStyles>; t: Strings;
}) {
  return <View style={styles.pickerRow}>
    <TouchableOpacity style={styles.pickerTask} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <Text style={styles.pickerTaskName} numberOfLines={1}>{task.icon ? `${task.icon} ` : ''}{task.name}</Text>
      {task.archived === 1 ? <Text style={styles.hiddenBadge}>{t.activityHidden}</Text> : null}
    </TouchableOpacity>
    <TouchableOpacity style={styles.pinButton} onPress={onPin} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t.activityPinned}>
      <Text style={[styles.pinText, task.is_pinned === 1 && styles.pinTextActive]}>{task.is_pinned === 1 ? '★' : '☆'}</Text>
    </TouchableOpacity>
  </View>;
}

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
  const [duration, setDuration] = useState('');
  const [durationUnit, setDurationUnit] = useState<'min' | 'hr'>('min');
  const [customDuration, setCustomDuration] = useState(false);

  function handleCustomLog() {
    const parsed = parseInt(duration, 10);
    if (isNaN(parsed) || parsed <= 0) { Alert.alert(t.error, t.validDuration); return; }
    const mins = durationUnit === 'hr' ? parsed * 60 : parsed;
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
          <View style={styles.presetChipsRow}>
            {([{ label: '30m', mins: 30 }, { label: '45m', mins: 45 }, { label: '1h', mins: 60 }] as const).map(p => (
              <TouchableOpacity
                key={p.label}
                style={styles.presetChip}
                onPress={() => onLogDuration(p.mins)}
                disabled={isPending}
                activeOpacity={0.75}
                accessibilityRole="button"
              >
                <Text style={styles.presetChipText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.presetChip, styles.presetChipCustom]}
              onPress={() => setCustomDuration(true)}
              activeOpacity={0.75}
              accessibilityRole="button"
            >
              <Text style={[styles.presetChipText, styles.presetChipCustomText]}>{t.durationCustom}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.durationRow}>
              <TextInput
                style={[styles.input, styles.durationInput]}
                keyboardType="number-pad"
                value={duration}
                onChangeText={setDuration}
                placeholder="0"
                placeholderTextColor={colors.faint}
                autoFocus
              />
              <View style={styles.unitToggle}>
                <TouchableOpacity
                  style={[styles.unitBtn, durationUnit === 'min' && styles.unitBtnActive]}
                  onPress={() => setDurationUnit('min')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: durationUnit === 'min' }}
                >
                  <Text style={[styles.unitBtnText, durationUnit === 'min' && styles.unitBtnTextActive]}>{t.unitMin}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitBtn, durationUnit === 'hr' && styles.unitBtnActive]}
                  onPress={() => setDurationUnit('hr')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: durationUnit === 'hr' }}
                >
                  <Text style={[styles.unitBtnText, durationUnit === 'hr' && styles.unitBtnTextActive]}>{t.unitHour}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={styles.durationChip} onPress={handleCustomLog} disabled={isPending} accessibilityRole="button">
              {isPending ? (
                <ActivityIndicator color={colors.white} />
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
export function AddActivitySheet({ visible, onClose, presetName }: Props) {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const [lang] = useLanguage();
  const reduceMotion = useReduceMotion();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const createTask = useCreateTask(userId);
  const logTask = useLogTask(userId);
  const { data: pickerTasks = [] } = useActivityPickerTasks(userId);
  const setTaskPinned = useSetTaskPinned(userId);
  const restoreTask = useRestoreTask(userId);

  const [name, setName] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<TemplateTask | null>(null);
  const [selectedExistingTask, setSelectedExistingTask] = useState<PickerTask | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [translating, setTranslating] = useState(false);
  const submittingRef = useRef(false);

  async function translateActivityName(rawName: string): Promise<string> {
    if (!supabase) return rawName;
    try {
      const { data, error } = await supabase.functions.invoke('translate-name', {
        body: { name: rawName, targetLanguage: lang },
      });
      if (error || !data?.translated) return rawName;
      return (data.translated as string).trim() || rawName;
    } catch {
      return rawName;
    }
  }

  type PendingTask = { id: number; name: string; basePoints: number; starPenalty: number };
  const [step, setStep] = useState<'create' | 'duration'>('create');
  const [pendingTask, setPendingTask] = useState<PendingTask | null>(null);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible && presetName) {
      setName(presetName);
      setSelectedSuggestion(null);
      setSelectedExistingTask(null);
    }
  }, [visible, presetName]);

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
      sheetTranslateY.setValue(300);
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
      Animated.spring(sheetTranslateY, { toValue: 300, tension: 120, friction: 12, useNativeDriver: true }),
    ]).start(() => {
      setName('');
      setSelectedSuggestion(null);
      setSelectedExistingTask(null);
      setStep('create');
      setPendingTask(null);
      submittingRef.current = false;
      onClose();
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(300);
    });
  }

  function handleSuggestionTap(task: TemplateTask) {
    setName((t as Record<string, unknown>)[task.nameKey] as string ?? task.name);
    setSelectedSuggestion(task);
    setSelectedExistingTask(null);
  }

  async function handlePickerTask(task: PickerTask) {
    if (task.archived === 1) await restoreTask.mutateAsync(task.id);
    setName(task.name);
    setSelectedSuggestion(null);
    setSelectedExistingTask({ ...task, archived: 0 });
  }

  async function handlePin(task: PickerTask) {
    try {
      await setTaskPinned.mutateAsync({ taskId: task.id, pinned: task.is_pinned === 0 });
    } catch (error) {
      if (error instanceof Error && error.message === 'PIN_LIMIT') Alert.alert(t.error, t.activityPinLimit);
    }
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

    // An unedited presetName is already an existing task's exact stored name
    // (e.g. from a linked-challenge "Ghi ngay" deep-link) -- translating it
    // would silently create/match a *different* task_type and break the
    // link. Skip translation only while the text still matches the preset
    // verbatim; an edited name is freeform again and gets translated as usual.
    const usingUneditedPreset = !selectedSuggestion && presetName != null && trimmed === presetName;

    if (lang !== 'vi' && !selectedSuggestion && !usingUneditedPreset && !selectedExistingTask) {
      setTranslating(true);
      try {
        storeName = await translateActivityName(trimmed);
      } finally {
        setTranslating(false);
      }
    }

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
      });

      if (isTimeBased) {
        Keyboard.dismiss();
        setPendingTask({ id: taskId, name: storeName, basePoints: taskBasePoints, starPenalty: 0 });
        setStep('duration');
        submittingRef.current = false;
      } else {
        Toast.show({ type: 'success', text1: t.taskAdded, text2: resolveTaskDisplayName(storeName, t), visibilityTime: 2000 });
        handleClose();
      }
    } catch {
      Alert.alert(t.error, t.cantLog);
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
      Toast.show({ type: 'success', text1: t.taskAdded, text2: resolveTaskDisplayName(pendingTask.name, t), visibilityTime: 2000 });
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
  const groupedTasks = useMemo(() => activePickerTasks.reduce<Record<string, PickerTask[]>>((groups, task) => {
    const group = activityGroup(task.name);
    (groups[group] ??= []).push(task);
    return groups;
  }, {}), [activePickerTasks]);

  const hasName = name.trim().length > 0;
  const isPending = createTask.isPending || logTask.isPending || translating;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={styles.kav} behavior="padding">
      <View style={styles.backdrop}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: backdropOpacity }]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel={t.cancel}
          />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
          <View style={styles.handle} />

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
                />

                {presetName == null && query.length > 0 && (
                  <>
                    <Text style={styles.suggestionsLabel}>{t.activitySearch}</Text>
                    {searchTasks.map(task => <PickerTaskRow key={task.id} task={task} onPress={() => void handlePickerTask(task)} onPin={() => void handlePin(task)} styles={styles} t={t} />)}
                    <View style={styles.chipsWrap}>{suggestions.filter(task => activityMatches(task, query)).map(task => <SuggestionChip key={task.nameKey} s={task} isSelected={false} onPress={() => handleSuggestionTap(task)} t={t as Record<string, unknown>} styles={styles} />)}</View>
                  </>
                )}

                {presetName == null && query.length === 0 && pinnedTasks.length > 0 && (
                  <>
                    <View style={styles.sectionHeader}><Text style={styles.suggestionsLabel}>{t.activityPinned} · {pinnedTasks.length}/{MAX_PINNED_ACTIVITIES}</Text></View>
                    {pinnedTasks.map(task => <PickerTaskRow key={task.id} task={task} onPress={() => void handlePickerTask(task)} onPin={() => void handlePin(task)} styles={styles} t={t} />)}
                  </>
                )}

                {presetName == null && query.length === 0 && recentTasks.length > 0 && (
                  <>
                    <Text style={styles.suggestionsLabel}>{t.activityRecent}</Text>
                    {recentTasks.slice(0, 6).map(task => <PickerTaskRow key={task.id} task={task} onPress={() => void handlePickerTask(task)} onPin={() => void handlePin(task)} styles={styles} t={t} />)}
                  </>
                )}

                {presetName == null && query.length === 0 && activePickerTasks.length > 0 && (
                  <>
                    <TouchableOpacity style={styles.browseButton} onPress={() => setShowAll(value => !value)} accessibilityRole="button"><Text style={styles.browseText}>{showAll ? t.activityHideAll : t.activityBrowseAll}</Text></TouchableOpacity>
                    {showAll && Object.entries(groupedTasks).map(([group, tasks]) => <View key={group}>
                      <TouchableOpacity style={styles.groupHeader} onPress={() => setCollapsedGroups(value => ({ ...value, [group]: !value[group] }))} accessibilityRole="button"><Text style={styles.groupTitle}>{group}</Text><Text style={styles.groupToggle}>{collapsedGroups[group] ? '⌄' : '⌃'}</Text></TouchableOpacity>
                      {!collapsedGroups[group] && tasks.map(task => <PickerTaskRow key={task.id} task={task} onPress={() => void handlePickerTask(task)} onPin={() => void handlePin(task)} styles={styles} t={t} />)}
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
                            onPress={() => handleSuggestionTap(s)}
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
                  accessibilityState={{ disabled: !hasName || isPending }}
                >
                  {createTask.isPending || translating ? (
                    <ActivityIndicator color={colors.white} />
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

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    kav: { flex: 1 },
    backdrop: { flex: 1, justifyContent: 'center', padding: Spacing.lg },
    sheet: {
      backgroundColor: C.surface,
      borderRadius: Radii.xxl,
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
    pinText: { color: C.faint, fontSize: 22 }, pinTextActive: { color: C.starGold },
    browseButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.sm },
    browseText: { color: C.primary, fontFamily: FontFamily.bold, fontSize: 14 },
    groupHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
    groupTitle: { color: C.ink2, fontFamily: FontFamily.extraBold, fontSize: 12 }, groupToggle: { color: C.muted, fontSize: 16 },
    chip: {
      backgroundColor: C.surface2, borderRadius: Radii.pill,
      paddingVertical: 7, paddingHorizontal: 14,
      borderWidth: 1, borderColor: C.line2,
    },
    chipSelected: { borderColor: C.primary, backgroundColor: C.primarySoft },
    chipName: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.inkDark, lineHeight: 18 },
    chipNameSelected: { color: C.primary },
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
    durationChipText: { color: C.white, fontSize: 15, fontFamily: FontFamily.bold },
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
    backText: { color: C.primary, fontSize: 14, fontFamily: FontFamily.bold },
    durationStepTitle: { fontSize: 19, fontFamily: FontFamily.extraBold, color: C.inkDark, marginBottom: 2 },
    presetChipsRow: { flexDirection: 'row', gap: 10, marginTop: Spacing.md, marginBottom: Spacing.md, flexWrap: 'wrap' },
    presetChip: {
      flex: 1, minWidth: 60, backgroundColor: C.primary,
      borderRadius: Radii.md, paddingVertical: 16,
      alignItems: 'center', justifyContent: 'center',
    },
    presetChipCustom: { backgroundColor: C.surface2, borderWidth: 1.5, borderColor: C.line2 },
    presetChipText: { color: C.white, fontSize: 16, fontFamily: FontFamily.extraBold },
    presetChipCustomText: { color: C.inkDark },
    durationRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10, marginBottom: Spacing.md, marginTop: Spacing.md },
    durationInput: { flex: 1, fontSize: 22, fontFamily: FontFamily.bold, textAlign: 'center' },
    unitToggle: { flexDirection: 'column', borderRadius: Radii.md, overflow: 'hidden', borderWidth: 1.5, borderColor: C.line2 },
    unitBtn: { flex: 1, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: C.surface2 },
    unitBtnActive: { backgroundColor: C.primary },
    unitBtnText: { fontSize: 13, fontFamily: FontFamily.bold, color: C.muted },
    unitBtnTextActive: { color: C.white },
  });
}
