import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useTodayTasks } from '../queries/useToday';
import { useBackfillDay, type BackfillEntryParams } from '../queries/useBackfill';
import { backfillRemaining } from '../game/backfill';
import { AppColors, FontFamily, Radii, Spacing } from '../config/theme';

const DURATION_OPTIONS: { label: string; mins: number }[] = [
  { label: '30', mins: 30 },
  { label: '1h', mins: 60 },
  { label: '1.5h', mins: 90 },
];

type PickerTask = { id: number; icon?: string | null; name: string };
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
  durationMin?: number;
}

function resolveBackfillError(msg: string | undefined, t: BackfillErrorT): string {
  if (msg === 'QUOTA_EXCEEDED') return t.backfillDenyQuota;
  if (msg === 'DAY_NOT_EMPTY') return t.backfillDenyFull;
  if (msg === 'HAS_FREEZE') return t.backfillDenyFreeze;
  return t.cantLog;
}

interface TaskPickerListProps {
  tasks: PickerTask[];
  selectedTaskId: number | null;
  onSelect: (id: number | null) => void;
  emptyText: string;
  colors: AppColors;
  styles: ReturnType<typeof makeStyles>;
}

interface DurationPickerProps {
  durationMin: number;
  onSelect: (mins: number) => void;
  colors: AppColors;
  styles: ReturnType<typeof makeStyles>;
}

function DurationPicker({ durationMin, onSelect, colors, styles }: DurationPickerProps) {
  return (
    <View style={styles.durationRow} accessibilityRole="radiogroup">
      {DURATION_OPTIONS.map(opt => {
        const on = durationMin === opt.mins;
        return (
          <TouchableOpacity key={opt.mins}
            style={[styles.durChip, on && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
            onPress={() => onSelect(opt.mins)} activeOpacity={0.7}
            accessibilityRole="radio" accessibilityLabel={opt.label} accessibilityState={{ checked: on }}>
            <Text style={[styles.durChipText, on && { color: colors.primary, fontFamily: FontFamily.semiBold }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TaskPickerList({ tasks, selectedTaskId, onSelect, emptyText, colors, styles }: TaskPickerListProps) {
  if (tasks.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>{emptyText}</Text>
      </View>
    );
  }
  return (
    <ScrollView style={styles.taskList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {tasks.map(task => {
        const on = selectedTaskId === task.id;
        return (
          <TouchableOpacity key={task.id} style={[styles.taskRow, on && { backgroundColor: colors.primarySoft }]}
            onPress={() => onSelect(on ? null : task.id)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={styles.taskIcon}>{task.icon ?? '⭐'}</Text>
            <Text style={[styles.taskName, on && { color: colors.primary, fontFamily: FontFamily.semiBold }]} numberOfLines={1}>{task.name}</Text>
            {on && <Text style={[styles.checkMark, { color: colors.primary }]}>✓</Text>}
          </TouchableOpacity>
        );
      })}
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

function formatEntryMeta(entry: DraftEntry, formatDuration: (mins: number) => string): string | null {
  if (entry.isTimeBased && entry.durationMin) return formatDuration(entry.durationMin);
  return null;
}

function EntryList({ entries, editingEntryId, locked, onEdit, onRemove, colors, styles, editLabel, removeLabel, formatDuration }: EntryListProps) {
  if (entries.length === 0) return null;
  return (
    <View style={styles.entryList}>
      {entries.map(entry => {
        const meta = formatEntryMeta(entry, formatDuration);
        const isEditing = editingEntryId === entry.id;
        return (
          <View key={entry.id} style={[styles.entryRow, isEditing && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
            <Text style={styles.taskIcon}>{entry.icon ?? '⭐'}</Text>
            <View style={styles.entryTextCol}>
              <Text style={[styles.entryName, isEditing && { color: colors.primary, fontFamily: FontFamily.semiBold }]} numberOfLines={1}>{entry.name}</Text>
              {meta && <Text style={styles.entryMeta}>{meta}</Text>}
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
                  <Text style={[styles.entryActionText, { color: colors.danger }]}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            {locked && <Text style={[styles.checkMark, { color: colors.primary }]}>✓</Text>}
          </View>
        );
      })}
    </View>
  );
}

interface Props {
  visible: boolean;
  date: string; // YYYY-MM-DD
  backfillsUsedThisWeek: number;
  userId: number;
  onClose: () => void;
}

export function BackfillSheet({ visible, date, backfillsUsedThisWeek, userId, onClose }: Props) {
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data: tasks = [] } = useTodayTasks(userId);
  const { mutateAsync, isPending } = useBackfillDay(userId);

  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState<number>(30);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const nextEntryId = useRef(0);

  useEffect(() => {
    if (visible) {
      setEntries([]);
      setSelectedTaskId(null);
      setDurationMin(30);
      setEditingEntryId(null);
      setLocked(false);
    }
  }, [visible]);

  const remaining = backfillRemaining(backfillsUsedThisWeek);
  const quotaExceeded = remaining <= 0;
  const selectedTask = useMemo(() => tasks.find(tk => tk.id === selectedTaskId), [tasks, selectedTaskId]);
  const needsDuration = !!selectedTask?.is_time_based;

  function formatDate(d: string): string {
    const [y, m, day] = d.split('-').map(Number);
    const dt = new Date(y, m - 1, day);
    const dow = t.dayNames[dt.getDay()];
    return `${dow}, ${day}/${m}`;
  }

  function handleSelectTask(id: number | null) {
    setSelectedTaskId(id);
    setDurationMin(30);
  }

  function handleAddOrUpdate() {
    if (!selectedTask) return;
    const draft: DraftEntry = {
      id: editingEntryId ?? String(nextEntryId.current++),
      taskTypeId: selectedTask.id,
      name: selectedTask.name,
      icon: selectedTask.icon,
      kind: selectedTask.kind as 'GOOD' | 'BAD',
      isTimeBased: !!selectedTask.is_time_based,
      basePoints: selectedTask.base_points,
      starPenalty: selectedTask.star_penalty,
      durationMin: needsDuration ? durationMin : undefined,
    };
    setEntries(prev => {
      if (editingEntryId) return prev.map(e => (e.id === editingEntryId ? draft : e));
      return [...prev, draft];
    });
    setSelectedTaskId(null);
    setDurationMin(30);
    setEditingEntryId(null);
  }

  function handleEditEntry(id: string) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    setEditingEntryId(id);
    setSelectedTaskId(entry.taskTypeId);
    setDurationMin(entry.durationMin ?? 30);
  }

  function handleRemoveEntry(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
    if (editingEntryId === id) {
      setEditingEntryId(null);
      setSelectedTaskId(null);
      setDurationMin(30);
    }
  }

  async function submitSession() {
    try {
      const payload: BackfillEntryParams[] = entries.map(e => ({
        taskTypeId: e.taskTypeId,
        kind: e.kind,
        isTimeBased: e.isTimeBased,
        basePoints: e.basePoints,
        starPenalty: e.starPenalty,
        durationMin: e.durationMin,
      }));
      await mutateAsync({ date, entries: payload });
      setLocked(true);
      Toast.show({ type: 'success', text1: t.backfillSuccess });
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

  const addDisabled = !selectedTask;
  const ctaDisabled = entries.length === 0 || isPending || locked;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t.close} />
        <View style={styles.sheet}>
          <View style={styles.grip} />

          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>{t.backfillTitle}</Text>
              <Text style={styles.dateLabel}>{formatDate(date)}</Text>
            </View>
            <View style={[styles.quotaBadge, quotaExceeded && { backgroundColor: colors.dangerSoft }]}>
              <Text style={[styles.quotaText, quotaExceeded && { color: colors.danger }]}>
                {t.backfillQuota(remaining)}
              </Text>
            </View>
          </View>

          {quotaExceeded ? (
            <View style={styles.quotaExhausted}>
              <Text style={styles.quotaExhaustedText}>{t.backfillDenyQuota}</Text>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
                  <TaskPickerList
                    tasks={tasks}
                    selectedTaskId={selectedTaskId}
                    onSelect={handleSelectTask}
                    emptyText={t.backfillNoTasks}
                    colors={colors}
                    styles={styles}
                  />

                  {needsDuration && (
                    <DurationPicker durationMin={durationMin} onSelect={setDurationMin} colors={colors} styles={styles} />
                  )}

                  <TouchableOpacity
                    style={[styles.addBtn, addDisabled && styles.addBtnDisabled]}
                    onPress={handleAddOrUpdate}
                    disabled={addDisabled}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={editingEntryId ? t.backfillUpdateActivity : t.backfillAddActivity}
                  >
                    <Text style={styles.addBtnText}>
                      {editingEntryId ? t.backfillUpdateActivity : t.backfillAddActivity}
                    </Text>
                  </TouchableOpacity>

                  {entries.length === 0 && (
                    <Text style={styles.emptyDraftHint}>{t.backfillEmptyDraft}</Text>
                  )}

                  <TouchableOpacity
                    style={[styles.cta, ctaDisabled && styles.ctaDisabled]}
                    onPress={handleConfirmPress}
                    disabled={ctaDisabled}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t.backfillConfirm}
                  >
                    {isPending
                      ? <ActivityIndicator color={colors.white} />
                      : <Text style={styles.ctaText}>{t.backfillConfirm}</Text>
                    }
                  </TouchableOpacity>
                </>
              )}

              {locked && (
                <TouchableOpacity
                  style={styles.cta}
                  onPress={onClose}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t.close}
                >
                  <Text style={styles.ctaText}>{t.close}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radii.xl,
      borderTopRightRadius: Radii.xl,
      paddingHorizontal: Spacing.lg,
      paddingBottom: 36,
      paddingTop: 12,
      maxHeight: '85%',
    },
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
      color: colors.primary,
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
    emptyDraftHint: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      color: colors.ink2,
      textAlign: 'center',
      marginTop: 10,
    },
    taskList: {
      maxHeight: 240,
    },
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
    durationRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
      marginBottom: 4,
    },
    durChip: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: Radii.sm,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
    },
    durChipText: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      color: colors.ink2,
    },
    addBtn: {
      marginTop: 14,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: Radii.md,
      paddingVertical: 12,
      alignItems: 'center',
    },
    addBtnDisabled: {
      opacity: 0.4,
    },
    addBtnText: {
      fontSize: 14,
      fontFamily: FontFamily.semiBold,
      color: colors.primary,
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
      width: 44,
      height: 44,
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
      color: colors.primary,
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
      color: colors.white,
    },
  });
}
