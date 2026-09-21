import React, { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateTask } from '../queries/useTasks';
import { useUpdateTaskName } from '../queries/useTasks';
import { useActivityPickerTasks, useRestoreTask, useSetTaskPinned } from '../queries/useTasks';
import { useBackfillDay, type BackfillEntryParams } from '../queries/useBackfill';
import { backfillRemaining, shouldShowBackfillQuotaExhausted } from '../game/backfill';
import { AppColors, FontFamily, Radii, Spacing } from '../config/theme';
import { TEMPLATE_CATEGORIES, type TemplateTask } from '../config/constants';
import { AddActivitySheet, type ActivityAddedResult } from '../screens/AddActivitySheet';
import { EditActivityModal } from './EditActivityModal';
import type { Task } from './TaskRow';
import type { StreakMilestone } from '../game/streakMilestones';
import { DurationClockInput } from './DurationClockInput';
import { DurationPresetChips } from './DurationPresetChips';
import { clockMinutes } from '../utils/durationClock';
import { activityMatches, activityPinAccessibilityLabel, filterDuplicateActivitySuggestions, MAX_PINNED_ACTIVITIES, type PickerTask } from '../utils/activityPicker';
import { resolveTaskDisplayName } from '../utils/resolveTaskDisplayName';
import type { Strings } from '../config/i18n';
type BackfillErrorT = { backfillDenyQuota: string; backfillDenyFull: string; backfillDenyFreeze: string; cantLog: string };

interface DraftEntry {
  id: string;
  taskTypeId: number;
  name: string;
  icon?: string | null;
  kind: 'GOOD' | 'BAD';
  isTimeBased: boolean;
  basePoints: number;
  starPenalty: number;
  durationMin: number | null;
}

function resolveBackfillError(msg: string | undefined, t: BackfillErrorT): string {
  if (msg === 'QUOTA_EXCEEDED') return t.backfillDenyQuota;
  if (msg === 'DAY_NOT_EMPTY') return t.backfillDenyFull;
  if (msg === 'HAS_FREEZE') return t.backfillDenyFreeze;
  return t.cantLog;
}

const PickerTaskRow = React.memo(function PickerTaskRow({ task, onPress, onPin, styles, t }: {
  task: PickerTask;
  onPress: (task: PickerTask) => void;
  onPin: (task: PickerTask) => void;
  styles: ReturnType<typeof makeStyles>;
  t: Strings;
}) {
  const taskLabel = resolveTaskDisplayName(task.name, t, task.is_template === 1);
  return (
    <View style={styles.pickerRow}>
      <TouchableOpacity
        style={styles.pickerTask}
        onPress={() => onPress(task)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={taskLabel}
      >
        <Text style={styles.pickerTaskName} numberOfLines={1}>
          {task.icon ? `${task.icon} ` : ''}{taskLabel}
        </Text>
        {task.archived === 1 ? <Text style={styles.hiddenBadge}>{t.activityHidden}</Text> : null}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.pinButton}
        onPress={() => onPin(task)}
        activeOpacity={0.7}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={activityPinAccessibilityLabel(task.is_pinned === 1 ? t.activityUnpin : t.activityPin, taskLabel)}
        accessibilityState={{ selected: task.is_pinned === 1 }}
      >
        <Text style={[styles.pinText, task.is_pinned === 1 && styles.pinTextActive]}>{task.is_pinned === 1 ? '★' : '☆'}</Text>
      </TouchableOpacity>
    </View>
  );
});

const MAX_VISIBLE_RECENT_ACTIVITIES = 6;

interface BackfillDurationStepProps {
  taskName: string;
  isPending: boolean;
  onLogDuration: (mins: number) => void;
  onBack: () => void;
  t: Strings;
  colors: AppColors;
  styles: ReturnType<typeof makeStyles>;
}

function BackfillDurationStep({ taskName, isPending, onLogDuration, onBack, t, colors, styles }: BackfillDurationStepProps) {
  const [clock, setClock] = useState({ hours: 0, minutes: 0 });
  const [customDuration, setCustomDuration] = useState(false);

  function handleCustomLog() {
    const mins = clockMinutes(clock);
    if (mins <= 0) { Alert.alert(t.error, t.validDuration); return; }
    if (mins > 1440) { Alert.alert(t.error, t.maxDuration); return; }
    onLogDuration(mins);
  }

  return (
    <ScrollView style={styles.durationScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={styles.backButton} onPress={onBack} accessibilityRole="button" accessibilityLabel={t.back}>
        <Text style={styles.backText}>{t.back}</Text>
      </TouchableOpacity>
      <Text style={styles.durationStepTitle}>{resolveTaskDisplayName(taskName, t)}</Text>
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
          <DurationClockInput value={clock} onChange={setClock} colors={colors} hoursLabel={t.unitHour} minutesLabel={t.unitMin} editValueLabel={t.durationEditValue} />
          <TouchableOpacity style={styles.durationChip} onPress={handleCustomLog} disabled={isPending} accessibilityRole="button" accessibilityLabel={t.logBtn}>
            {isPending ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.durationChipText}>{t.logBtn}</Text>}
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity style={styles.noTimerBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel={t.cancel}>
        <Text style={styles.noTimerText}>{t.cancel}</Text>
      </TouchableOpacity>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

interface EntryListProps {
  entries: DraftEntry[];
  editingEntryId: string | null;
  locked: boolean;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  colors: AppColors;
  styles: ReturnType<typeof makeStyles>;
  editLabel: string;
  removeLabel: string;
  formatDuration: (mins: number) => string;
}

function formatEntryMeta(entry: DraftEntry, formatDuration: (mins: number) => string): string {
  return entry.durationMin == null ? '' : formatDuration(entry.durationMin);
}

const EntryList = React.memo(function EntryList({ entries, editingEntryId, locked, onEdit, onRemove, colors, styles, editLabel, removeLabel, formatDuration }: EntryListProps) {
  if (entries.length === 0) return null;
  return (
    <View style={styles.entryList}>
      {entries.map(entry => {
        const meta = formatEntryMeta(entry, formatDuration);
        const isEditing = editingEntryId === entry.id;
        return (
          <View key={entry.id} style={[styles.entryRow, isEditing && { backgroundColor: colors.primarySoft, borderColor: colors.primaryPress }]}>
            <Text style={styles.taskIcon}>{entry.icon ?? '⭐'}</Text>
            <View style={styles.entryTextCol}>
              <Text style={[styles.entryName, isEditing && { color: colors.primaryText, fontFamily: FontFamily.semiBold }]} numberOfLines={1}>{entry.name}</Text>
              <Text style={styles.entryMeta}>{meta}</Text>
            </View>
            {!locked && (
              <View style={styles.entryActions}>
                <TouchableOpacity onPress={() => onEdit(entry.id)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel={`${editLabel}: ${entry.name}`}
                  style={styles.entryActionBtn}>
                  <Text style={styles.entryActionText}>✎</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onRemove(entry.id)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel={`${removeLabel}: ${entry.name}`}
                  style={styles.entryActionBtn}>
                  <Text style={[styles.entryActionText, { color: colors.dangerText }]}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            {locked && <Text style={[styles.checkMark, { color: colors.primaryText }]}>✓</Text>}
          </View>
        );
      })}
    </View>
  );
});

interface Props {
  visible: boolean;
  date: string; // YYYY-MM-DD
  backfillsUsedThisWeek: number;
  userId: number;
  onMilestone: (milestone: StreakMilestone) => void;
  onClose: () => void;
}

export function BackfillSheet({ visible, date, backfillsUsedThisWeek, userId, onMilestone, onClose }: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const t = useTranslations();
  const { bottom } = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, bottom), [colors, bottom]);

  const { data: pickerTasks = [] } = useActivityPickerTasks(userId);
  const createTask = useCreateTask(userId);
  const updateTaskName = useUpdateTaskName(userId);
  const restoreTask = useRestoreTask(userId);
  const setTaskPinned = useSetTaskPinned(userId);
  const { mutateAsync, isPending } = useBackfillDay(userId);

  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [name, setName] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<TemplateTask | null>(null);
  const [selectedExistingTask, setSelectedExistingTask] = useState<PickerTask | null>(null);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [step, setStep] = useState<'pick' | 'duration'>('pick');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const nextEntryId = useRef(0);

  useEffect(() => {
    if (visible) {
      setEntries([]);
      setName('');
      setSelectedSuggestion(null);
      setSelectedExistingTask(null);
      setShowAllRecent(false);
      setStep('pick');
      setEditingEntryId(null);
      setLocked(false);
    }
  }, [visible]);

  const remaining = backfillRemaining(backfillsUsedThisWeek);
  const quotaExceeded = remaining <= 0;

  function formatDate(d: string): string {
    const [y, m, day] = d.split('-').map(Number);
    const dt = new Date(y, m - 1, day);
    const dow = t.dayNames[dt.getDay()];
    return `${dow}, ${day}/${m}`;
  }

  const handleSuggestionTap = useCallback((suggestion: TemplateTask) => {
    setName((t as Record<string, unknown>)[suggestion.nameKey] as string ?? suggestion.name);
    setSelectedSuggestion(suggestion);
    setSelectedExistingTask(null);
  }, [t]);

  const handlePickerTask = useCallback(async (task: PickerTask) => {
    if (task.archived === 1) await restoreTask.mutateAsync(task.id);
    setName(task.name);
    setSelectedSuggestion(null);
    setSelectedExistingTask({ ...task, archived: 0 });
  }, [restoreTask]);

  const handlePin = useCallback(async (task: PickerTask) => {
    try {
      await setTaskPinned.mutateAsync({ taskId: task.id, pinned: task.is_pinned === 0 });
    } catch (error) {
      if (error instanceof Error && error.message === 'PIN_LIMIT') Alert.alert(t.error, t.activityPinLimit);
    }
  }, [setTaskPinned, t]);

  const renderPickerTaskRow = useCallback((task: PickerTask) => (
    <PickerTaskRow key={task.id} task={task} onPress={handlePickerTask} onPin={handlePin} styles={styles} t={t} />
  ), [handlePickerTask, handlePin, styles, t]);

  async function addEntry(isTimeBased: boolean, durationMin: number | null = null) {
    const currentLabel = selectedSuggestion
      ? ((t as Record<string, unknown>)[selectedSuggestion.nameKey] as string ?? selectedSuggestion.name)
      : null;
    const storeName = selectedExistingTask?.name ?? ((selectedSuggestion && name.trim() === currentLabel)
      ? selectedSuggestion.name
      : name.trim());
    if (!storeName) return;

    try {
      const taskTypeId = selectedExistingTask?.id ?? await createTask.mutateAsync({
        name: storeName,
        kind: 'GOOD',
        isTimeBased,
        basePoints: selectedSuggestion?.basePoints ?? (isTimeBased ? 1 : 5),
        starPenalty: selectedSuggestion?.starPenalty ?? 0,
        icon: selectedSuggestion?.icon,
        isTemplate: !!selectedSuggestion,
      });
      const task = selectedExistingTask;
      setEntries(prev => [...prev, {
        id: String(nextEntryId.current++),
        taskTypeId,
        name: task?.name ?? storeName,
        icon: task?.icon ?? selectedSuggestion?.icon,
        kind: (task?.kind ?? selectedSuggestion?.kind ?? 'GOOD') as 'GOOD' | 'BAD',
        isTimeBased,
        basePoints: task?.base_points ?? selectedSuggestion?.basePoints ?? (isTimeBased ? 1 : 5),
        starPenalty: task?.star_penalty ?? selectedSuggestion?.starPenalty ?? 0,
        durationMin: isTimeBased ? durationMin : null,
      }]);
      setName('');
      setSelectedSuggestion(null);
      setSelectedExistingTask(null);
      setShowAllRecent(false);
      setStep('pick');
    } catch (error: any) {
      Alert.alert(t.error, error?.message === 'DUPLICATE_ACTIVITY_NAME' ? t.activityDuplicate : t.cantLog);
    }
  }

  const handleEditEntry = useCallback((id: string) => {
    const entry = entries.find(e => e.id === id);
    const task = pickerTasks.find(item => item.id === entry?.taskTypeId);
    if (task) setEditTask(task as unknown as Task);
  }, [entries, pickerTasks]);

  async function saveEditedTask(taskId: number, name: string, isTimeBased: boolean, durationMin: number | null) {
    await updateTaskName.mutateAsync({ taskId, name, isTimeBased });
    setEntries(prev => prev.map(entry => entry.taskTypeId === taskId ? { ...entry, name, isTimeBased, durationMin: isTimeBased ? durationMin ?? entry.durationMin : null } : entry));
    setEditTask(null);
  }

  const handleRemoveEntry = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    if (editingEntryId === id) {
      setEditingEntryId(null);
      setName('');
      setSelectedSuggestion(null);
      setSelectedExistingTask(null);
    }
  }, [editingEntryId]);

  const handleActivityAdded = useCallback((activity: ActivityAddedResult) => {
    setEntries(prev => [...prev, {
      id: String(nextEntryId.current++),
      taskTypeId: activity.id,
      name: activity.name,
      icon: activity.icon,
      kind: activity.kind,
      isTimeBased: activity.isTimeBased,
      basePoints: activity.basePoints,
      starPenalty: activity.starPenalty,
      durationMin: activity.durationMin,
    }]);
    setName('');
    setSelectedSuggestion(null);
    setSelectedExistingTask(null);
    setShowAllRecent(false);
    setStep('pick');
  }, []);

  async function submitSession() {
    try {
      const payload: BackfillEntryParams[] = entries.map(e => ({
        taskTypeId: e.taskTypeId,
        kind: e.kind,
        isTimeBased: e.isTimeBased,
        basePoints: e.basePoints,
        starPenalty: e.starPenalty,
        durationMin: e.durationMin ?? undefined,
      }));
      const result = await mutateAsync({ date, entries: payload });
      setLocked(true);
      Toast.show({ type: 'success', text1: t.backfillSuccess });
      if (result.milestone) onMilestone(result.milestone);
    } catch (err: unknown) {
      Alert.alert(t.error, resolveBackfillError((err as Error)?.message, t));
    }
  }

  function handleConfirmPress() {
    if (entries.length === 0) return;
    Alert.alert(t.backfillConfirmTitle, t.backfillConfirmBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.confirm, onPress: () => { void submitSession(); } },
    ]);
  }

  const suggestions = useMemo(() => TEMPLATE_CATEGORIES.flatMap(c => c.tasks), []);
  const showPickerResults = selectedExistingTask === null && selectedSuggestion === null;
  const query = useDeferredValue(showPickerResults ? name.trim() : '');
  const selectedSuggestionKey = selectedSuggestion?.nameKey;
  const activePickerTasks = useMemo(() => pickerTasks.filter(task => task.archived === 0), [pickerTasks]);
  const pinnedTasks = useMemo(() => activePickerTasks.filter(task => task.is_pinned === 1), [activePickerTasks]);
  const recentTasks = useMemo(() => activePickerTasks.filter(task => task.is_pinned === 0 && task.last_used_date !== null), [activePickerTasks]);
  const visibleRecentTasks = showAllRecent ? recentTasks : recentTasks.slice(0, MAX_VISIBLE_RECENT_ACTIVITIES);
  const searchTasks = useMemo(() => query ? pickerTasks.filter(task => activityMatches(task, query)) : [], [pickerTasks, query]);
  const matchingSuggestions = useMemo(() => filterDuplicateActivitySuggestions(
    suggestions.filter(task => activityMatches(task, query)),
    searchTasks,
  ), [searchTasks, suggestions, query]);
  const hasSelection = name.trim().length > 0;
  const pickerPending = createTask.isPending || restoreTask.isPending || setTaskPinned.isPending;
  const addDisabled = !hasSelection || pickerPending;
  const ctaDisabled = entries.length === 0 || isPending || locked;

  return (
    // Hide this Modal while a child sheet is up. The child Modals stay outside this tree so
    // hiding the parent does not hide the child too; local draft state survives the toggle.
    <>
    <Modal visible={visible && !showAddActivity && !editTask} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t.close} />
        <View style={styles.sheet}>
          <View style={styles.grip} />

          <View style={styles.headerRow}>
            <View style={styles.headerTitleRow}>
              {locked && (
                <TouchableOpacity style={styles.headerBackButton} onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t.back}>
                  <Text style={styles.headerBackText}>←</Text>
                </TouchableOpacity>
              )}
              <View>
                <Text style={styles.title}>{t.backfillTitle}</Text>
                <Text style={styles.dateLabel}>{formatDate(date)}</Text>
              </View>
            </View>
            <View style={[styles.quotaBadge, quotaExceeded && { backgroundColor: colors.dangerSoft }]}>
              <Text style={[styles.quotaText, quotaExceeded && { color: colors.dangerText }]}>
                {t.backfillQuota(remaining)}
              </Text>
            </View>
          </View>

          {shouldShowBackfillQuotaExhausted(remaining, locked) ? (
            <View style={styles.quotaExhausted}>
              <Text style={styles.quotaExhaustedText}>{t.backfillDenyQuota}</Text>
            </View>
          ) : step === 'duration' ? (
            <BackfillDurationStep
              taskName={selectedExistingTask?.name ?? selectedSuggestion?.name ?? name}
              isPending={pickerPending}
              onLogDuration={mins => { void addEntry(true, mins); }}
              onBack={() => setStep('pick')}
              t={t}
              colors={colors}
              styles={styles}
            />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              {locked && (
                <View style={styles.lockedBanner}>
                  <Text style={styles.lockedBannerText}>{t.backfillLocked}</Text>
                </View>
              )}

              {entries.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>{t.backfillYourActivities}</Text>
                  <EntryList
                    entries={entries}
                    editingEntryId={editingEntryId}
                    locked={locked}
                    onEdit={handleEditEntry}
                    onRemove={handleRemoveEntry}
                    colors={colors}
                    styles={styles}
                    editLabel={t.editActivity}
                    removeLabel={t.delete}
                    formatDuration={t.backfillEntryDuration}
                  />
                </>
              )}

              {!locked && (
                <>
                  <Text style={styles.sectionLabel}>{t.backfillPickTask}</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={value => { setName(value); setSelectedSuggestion(null); setSelectedExistingTask(null); }}
                    placeholder={t.addActivityNamePlaceholder}
                    placeholderTextColor={colors.faint}
                    returnKeyType="done"
                    maxLength={50}
                    accessibilityLabel={t.addActivityNameLabel}
                  />

                  {showPickerResults && query.length > 0 && (
                    <>
                      <Text style={styles.suggestionsLabel}>{t.activitySearch}</Text>
                      {searchTasks.map(renderPickerTaskRow)}
                      <View style={styles.chipsWrap}>
                        {matchingSuggestions.map(s => (
                          <TouchableOpacity key={s.nameKey} style={[styles.chip, selectedSuggestionKey === s.nameKey && styles.chipSelected]} onPress={() => handleSuggestionTap(s)} accessibilityRole="button" accessibilityLabel={(t as Record<string, unknown>)[s.nameKey] as string ?? s.name} accessibilityState={{ selected: selectedSuggestionKey === s.nameKey }}>
                            <Text style={[styles.chipName, selectedSuggestionKey === s.nameKey && styles.chipNameSelected]}>{s.icon ? `${s.icon} ` : ''}{(t as Record<string, unknown>)[s.nameKey] as string ?? s.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  {showPickerResults && query.length === 0 && pinnedTasks.length > 0 && (
                    <>
                      <View style={styles.sectionHeader}><Text style={styles.suggestionsLabel}>{t.activityPinned} · {pinnedTasks.length}/{MAX_PINNED_ACTIVITIES}</Text></View>
                      {pinnedTasks.map(renderPickerTaskRow)}
                    </>
                  )}

                  {showPickerResults && query.length === 0 && recentTasks.length > 0 && (
                    <>
                      <Text style={styles.suggestionsLabel}>{t.activityRecent}</Text>
                      {visibleRecentTasks.map(renderPickerTaskRow)}
                      {recentTasks.length > MAX_VISIBLE_RECENT_ACTIVITIES && (
                        <TouchableOpacity
                          style={styles.moreButton}
                          onPress={() => setShowAllRecent(value => !value)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={showAllRecent ? t.activityHideAll : t.activityMore}
                          accessibilityState={{ expanded: showAllRecent }}
                        >
                          <Text style={styles.moreText}>{showAllRecent ? t.activityHideAll : t.activityMore}</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}

                  {showPickerResults && query.length === 0 && activePickerTasks.length === 0 && (
                    <>
                      <Text style={styles.suggestionsLabel}>{t.addActivitySuggestionsTitle}</Text>
                      <View style={styles.chipsWrap}>
                        {suggestions.map(s => {
                          const label = (t as Record<string, unknown>)[s.nameKey] as string ?? s.name;
                          return <TouchableOpacity key={s.nameKey} style={[styles.chip, selectedSuggestionKey === s.nameKey && styles.chipSelected]} onPress={() => handleSuggestionTap(s)} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: selectedSuggestionKey === s.nameKey }}><Text style={[styles.chipName, selectedSuggestionKey === s.nameKey && styles.chipNameSelected]}>{s.icon} {label}</Text></TouchableOpacity>;
                        })}
                      </View>
                    </>
                  )}

                  {hasSelection && (
                    <>
                      <Text style={styles.durationLabel}>{t.addActivityHowLong}</Text>
                      <TouchableOpacity style={[styles.durationChip, addDisabled && styles.ctaDisabled]} onPress={() => setStep('duration')} disabled={addDisabled} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.addActivityTimedBtn} accessibilityState={{ disabled: addDisabled }}>
                        <Text style={styles.durationChipText}>{t.addActivityTimedBtn}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.noTimerBtn, addDisabled && styles.noTimerBtnDisabled]} onPress={() => { void addEntry(false); }} disabled={addDisabled} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.addActivityNoTimer} accessibilityState={{ disabled: addDisabled }}>
                        <Text style={[styles.noTimerText, addDisabled && styles.noTimerTextDim]}>{t.addActivityNoTimer}</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {!hasSelection && (
                    <TouchableOpacity
                      style={styles.addBtn}
                      onPress={() => setShowAddActivity(true)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={t.backfillAddActivity}
                    >
                      <Text style={styles.addBtnText}>{t.backfillAddActivity}</Text>
                    </TouchableOpacity>
                  )}

                  {entries.length === 0 && hasSelection && (
                    <Text style={styles.emptyDraftHint}>{t.backfillEmptyDraft}</Text>
                  )}

                  {entries.length > 0 && (
                    <TouchableOpacity
                      style={[styles.cta, ctaDisabled && styles.ctaDisabled]}
                      onPress={handleConfirmPress}
                      disabled={ctaDisabled}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={t.backfillConfirm}
                    >
                      {isPending
                        ? <ActivityIndicator color={colors.onAccent} />
                        : <Text style={styles.ctaText}>{t.backfillConfirm}</Text>
                      }
                    </TouchableOpacity>
                  )}
                </>
              )}

            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <AddActivitySheet
      visible={showAddActivity}
      onClose={() => setShowAddActivity(false)}
      onActivityAdded={handleActivityAdded}
      hideRecent
      hideBrowseAll
      showBackButton
      inputPlaceholder={t.addActivityEmptyName}
    />
    <EditActivityModal visible={!!editTask} task={editTask} totalDurationMin={entries.find(entry => entry.taskTypeId === editTask?.id)?.durationMin ?? undefined} onClose={() => setEditTask(null)} onSave={(taskId, name, isTimeBased, durationMin) => { void saveEditedTask(taskId, name, isTimeBased, durationMin); }} />
    </>
  );
}

function makeStyles(colors: AppColors, bottomInset: number) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: colors.scrim,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radii.xl,
      borderTopRightRadius: Radii.xl,
      paddingHorizontal: Spacing.lg,
      paddingBottom: 36 + bottomInset,
      paddingTop: 12,
      maxHeight: '85%', alignSelf: 'center', width: '100%', maxWidth: 480,
    },
    scrollContent: { paddingBottom: Spacing.md },
    durationScroll: { paddingBottom: Spacing.md },
    grip: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line,
      alignSelf: 'center',
      marginBottom: 16,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
    headerBackButton: { width: 44, height: 44, marginRight: 4, alignItems: 'center', justifyContent: 'center' },
    headerBackText: { color: colors.primaryText, fontSize: 28, lineHeight: 30, fontFamily: FontFamily.semiBold },
    title: {
      fontSize: 18,
      fontFamily: FontFamily.bold,
      color: colors.inkDark,
    },
    dateLabel: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      color: colors.ink2,
      marginTop: 2,
    },
    quotaBadge: {
      backgroundColor: colors.primarySoft,
      borderRadius: Radii.sm,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    quotaText: {
      fontSize: 12,
      fontFamily: FontFamily.semiBold,
      color: colors.primaryText,
    },
    quotaExhausted: {
      paddingVertical: 32,
      alignItems: 'center',
    },
    quotaExhaustedText: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
      color: colors.ink2,
      textAlign: 'center',
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: FontFamily.semiBold,
      color: colors.ink2,
      marginBottom: 8,
    },
    emptyState: {
      paddingVertical: 20,
      alignItems: 'center',
    },
    emptyStateText: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      color: colors.ink2,
      textAlign: 'center',
    },
    input: {
      backgroundColor: colors.surface2,
      color: colors.inkDark,
      paddingHorizontal: 13,
      paddingVertical: 12,
      borderRadius: Radii.md,
      fontSize: 14,
      fontFamily: FontFamily.regular,
      borderWidth: 1.5,
      borderColor: colors.line2,
      marginBottom: Spacing.sm,
    },
    suggestionsLabel: {
      fontSize: 12,
      fontFamily: FontFamily.semiBold,
      color: colors.ink2,
      marginTop: Spacing.md,
      marginBottom: 10,
    },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center' },
    pickerRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line },
    pickerTask: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: Spacing.sm },
    pickerTaskName: { flexShrink: 1, color: colors.inkDark, fontSize: 14, fontFamily: FontFamily.semiBold },
    hiddenBadge: { color: colors.muted, backgroundColor: colors.surface2, borderRadius: Radii.pill, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3, fontSize: 9, fontFamily: FontFamily.extraBold },
    pinButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    pinText: { color: colors.faint, fontSize: 22 },
    pinTextActive: { color: colors.starGoldText },
    moreButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    moreText: { color: colors.primaryText, fontFamily: FontFamily.bold, fontSize: 14 },
    chip: { backgroundColor: colors.surface2, borderRadius: Radii.pill, paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line2 },
    chipSelected: { borderColor: colors.primaryPress, backgroundColor: colors.primarySoft },
    chipName: { fontSize: 13, fontFamily: FontFamily.semiBold, color: colors.inkDark, lineHeight: 18 },
    chipNameSelected: { color: colors.primaryText },
    suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    suggestion: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: colors.primarySoft, borderRadius: Radii.pill },
    suggestionText: { color: colors.primaryText, fontFamily: FontFamily.semiBold, fontSize: 12 },
    emptyDraftHint: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      color: colors.ink2,
      textAlign: 'center',
      marginTop: 10,
    },
    durationLabel: { fontSize: 15, fontFamily: FontFamily.semiBold, color: colors.inkDark, marginTop: Spacing.xl, marginBottom: Spacing.sm },
    durationLabelDim: { color: colors.muted },
    durationHint: { fontSize: 12, fontFamily: FontFamily.regular, color: colors.muted, marginBottom: Spacing.sm },
    durationChip: { backgroundColor: colors.primary, borderRadius: Radii.md, paddingVertical: 13, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
    durationChipText: { color: colors.onAccent, fontSize: 15, fontFamily: FontFamily.bold },
    noTimerBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, marginTop: Spacing.sm, borderRadius: Radii.md, borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surface2 },
    noTimerBtnDisabled: { backgroundColor: colors.surface, borderColor: colors.line },
    noTimerText: { fontSize: 15, fontFamily: FontFamily.semiBold, color: colors.inkDark },
    noTimerTextDim: { color: colors.faint },
    backButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginTop: Spacing.xs },
    backText: { color: colors.primaryText, fontSize: 14, fontFamily: FontFamily.bold },
    durationStepTitle: { fontSize: 19, fontFamily: FontFamily.extraBold, color: colors.inkDark, marginBottom: 2 },
    taskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius: Radii.sm,
      marginBottom: 4,
      minHeight: 44,
    },
    taskIcon: {
      fontSize: 20,
      marginRight: 10,
      width: 28,
      textAlign: 'center',
    },
    taskName: {
      flex: 1,
      fontSize: 15,
      fontFamily: FontFamily.regular,
      color: colors.inkDark,
    },
    checkMark: {
      fontSize: 16,
      fontFamily: FontFamily.bold,
      marginLeft: 8,
    },
    durationInput: {
      marginTop: 10, minHeight: 44, paddingHorizontal: 12,
      borderRadius: Radii.sm, borderWidth: 1, borderColor: colors.line,
      fontSize: 14, fontFamily: FontFamily.regular, color: colors.inkDark,
    },
    addBtn: {
      marginTop: 14,
      borderWidth: 1,
      borderColor: colors.primaryPress,
      borderRadius: Radii.md,
      paddingVertical: 12,
      alignItems: 'center',
    },
    addBtnText: {
      fontSize: 14,
      fontFamily: FontFamily.semiBold,
      color: colors.primaryText,
    },
    entryList: {
      marginBottom: 4,
    },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: Radii.sm,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 8,
      minHeight: 44,
    },
    entryTextCol: {
      flex: 1,
    },
    entryName: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
      color: colors.inkDark,
    },
    entryMeta: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      color: colors.ink2,
      marginTop: 2,
    },
    entryActions: {
      flexDirection: 'row',
      gap: 8,
    },
    entryActionBtn: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    entryActionText: {
      fontSize: 16,
      fontFamily: FontFamily.semiBold,
      color: colors.ink2,
    },
    lockedBanner: {
      backgroundColor: colors.primarySoft,
      borderRadius: Radii.sm,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 12,
      alignItems: 'center',
    },
    lockedBannerText: {
      fontSize: 13,
      fontFamily: FontFamily.semiBold,
      color: colors.primaryText,
    },
    cta: {
      marginTop: 16,
      backgroundColor: colors.primary,
      borderRadius: Radii.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    ctaDisabled: {
      opacity: 0.4,
    },
    ctaText: {
      fontSize: 15,
      fontFamily: FontFamily.bold,
      color: colors.onAccent,
    },
  });
}
