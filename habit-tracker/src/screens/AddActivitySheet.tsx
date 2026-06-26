import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  Alert, StyleSheet, ActivityIndicator, Animated, ScrollView,
  KeyboardAvoidingView, Keyboard,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useCreateTask } from '../queries/useTasks';
import { useLogTask } from '../queries/useToday';
import { cueModalOpen, cueModalClose } from '../audio/uiSounds';
import { useAuthUser } from '../hooks/useAuth';
import { Typography, Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { useTheme, useTranslations, useLanguage } from '../hooks/useSettings';
import { TEMPLATE_CATEGORIES, TemplateTask } from '../config/constants';
import { Strings } from '../config/i18n';
import { supabase } from '../api/supabase';
import { resolveTaskDisplayName } from '../utils/resolveTaskDisplayName';

interface Props { visible: boolean; onClose: () => void; onSuggest?: () => void; }

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
    >
      <Text style={[styles.chipName, isSelected && styles.chipNameSelected]}>
        {s.icon ? `${s.icon} ${label}` : label}
      </Text>
    </TouchableOpacity>
  );
}

type DurationStepProps = {
  pendingTaskName: string;
  isPending: boolean;
  onLogDuration: (mins: number) => void;
  onClose: () => void;
  t: Strings;
  colors: AppColors;
  styles: ReturnType<typeof makeStyles>;
};

function DurationStep({ pendingTaskName, isPending, onLogDuration, onClose, t, colors, styles }: DurationStepProps) {
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
              >
                <Text style={styles.presetChipText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.presetChip, styles.presetChipCustom]}
              onPress={() => setCustomDuration(true)}
              activeOpacity={0.75}
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
                >
                  <Text style={[styles.unitBtnText, durationUnit === 'min' && styles.unitBtnTextActive]}>{t.unitMin}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitBtn, durationUnit === 'hr' && styles.unitBtnActive]}
                  onPress={() => setDurationUnit('hr')}
                >
                  <Text style={[styles.unitBtnText, durationUnit === 'hr' && styles.unitBtnTextActive]}>{t.unitHour}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={styles.durationChip} onPress={handleCustomLog} disabled={isPending}>
              {isPending ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.durationChipText}>{t.logBtn}</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.noTimerBtn} onPress={onClose}>
          <Text style={styles.noTimerText}>{t.cancel}</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
  );
}

// fallow-ignore-next-line complexity
export function AddActivitySheet({ visible, onClose, onSuggest }: Props) {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const [lang] = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const createTask = useCreateTask(userId);
  const logTask = useLogTask(userId);

  const [name, setName] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<TemplateTask | null>(null);
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
    if (visible) {
      cueModalOpen();
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(sheetTranslateY, { toValue: 0, tension: 120, friction: 12, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  function handleClose() {
    Keyboard.dismiss();
    cueModalClose();
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.spring(sheetTranslateY, { toValue: 300, tension: 120, friction: 12, useNativeDriver: true }),
    ]).start(() => {
      setName('');
      setSelectedSuggestion(null);
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
    let storeName = (selectedSuggestion && trimmed === currentLabel)
      ? selectedSuggestion.name
      : trimmed;

    if (!selectedSuggestion) {
      setTranslating(true);
      try {
        storeName = await translateActivityName(trimmed);
      } finally {
        setTranslating(false);
      }
    }

    const taskBasePoints = isTimeBased
      ? (selectedSuggestion?.basePoints ?? 1)
      : (selectedSuggestion?.basePoints ?? 5);

    try {
      const taskId = await createTask.mutateAsync({
        name: storeName,
        kind: 'GOOD',
        isTimeBased,
        basePoints: taskBasePoints,
        starPenalty: 0,
        icon: selectedSuggestion?.icon,
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

  const suggestions = useMemo(() => TEMPLATE_CATEGORIES.flatMap(c => c.tasks), []);

  const hasName = name.trim().length > 0;
  const isPending = createTask.isPending || logTask.isPending || translating;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.kav} behavior="padding">
      <View style={styles.backdrop}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: backdropOpacity }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1} />
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
                  onChangeText={setName}
                  placeholder={t.addActivityNamePlaceholder}
                  placeholderTextColor={colors.faint}
                  returnKeyType="done"
                  maxLength={50}
                />

                {suggestions.length > 0 && (
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

                {onSuggest && (
                  <TouchableOpacity style={styles.suggestBtn} onPress={onSuggest} activeOpacity={0.7}>
                    <Text style={styles.suggestBtnText}>{'💡 ' + t.suggestActivity}</Text>
                  </TouchableOpacity>
                )}

                <Text style={[styles.durationLabel, !hasName && styles.durationLabelDim]}>
                  {t.addActivityHowLong}
                </Text>

                <TouchableOpacity
                  style={[styles.durationChip, !hasName && styles.durationChipDim]}
                  onPress={() => handleCreate(true)}
                  disabled={!hasName || isPending}
                  activeOpacity={0.8}
                >
                  {createTask.isPending || translating ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.durationChipText}>{t.addActivityTimedBtn}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.noTimerBtn}
                  onPress={() => handleCreate(false)}
                  disabled={!hasName || isPending}
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
    backdrop: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: Radii.xxl,
      borderTopRightRadius: Radii.xxl,
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
    chip: {
      backgroundColor: C.surface2, borderRadius: Radii.pill,
      paddingVertical: 7, paddingHorizontal: 14,
      borderWidth: 1, borderColor: C.line2,
    },
    chipSelected: { borderColor: C.primary, backgroundColor: C.primarySoft },
    chipName: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.inkDark },
    chipNameSelected: { color: C.primary },
    suggestBtn: {
      marginTop: Spacing.md, paddingVertical: 10, alignItems: 'center',
      borderWidth: 1.5, borderColor: C.line2, borderRadius: Radii.md,
    },
    suggestBtnText: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.muted },
    durationLabel: {
      ...Typography.bodyStrong, color: C.inkDark,
      marginTop: Spacing.xl, marginBottom: Spacing.sm,
    },
    durationLabelDim: { color: C.muted },
    durationChip: {
      backgroundColor: C.primary, borderRadius: Radii.md,
      paddingVertical: 13, paddingHorizontal: 20,
      alignItems: 'center', justifyContent: 'center',
    },
    durationChipDim: { backgroundColor: C.line2 },
    durationChipText: { color: C.white, fontSize: 15, fontFamily: FontFamily.bold },
    noTimerBtn: { alignItems: 'center', paddingVertical: 12 },
    noTimerText: { ...Typography.bodyStrong, color: C.muted },
    noTimerTextDim: { color: C.faint },

    durationStepTitle: { fontSize: 19, fontFamily: FontFamily.extraBold, color: C.inkDark, marginTop: Spacing.md, marginBottom: 2 },
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
