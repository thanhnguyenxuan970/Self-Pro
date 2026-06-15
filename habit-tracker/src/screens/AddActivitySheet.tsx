import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  Alert, StyleSheet, ActivityIndicator, Animated, ScrollView,
  KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useCreateTask } from '../queries/useTasks';
import { useLogTask } from '../queries/useToday';
import { cueModalOpen, cueModalClose } from '../audio/uiSounds';
import { useAuthUser } from '../hooks/useAuth';
import { Typography, Radii, Spacing, Shadows, AppColors } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { TEMPLATE_CATEGORIES, TemplateTask } from '../config/constants';

interface Props { visible: boolean; onClose: () => void; }

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

// fallow-ignore-next-line complexity
export function AddActivitySheet({ visible, onClose }: Props) {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const createTask = useCreateTask(userId);
  const logTask = useLogTask(userId);

  const [name, setName] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<TemplateTask | null>(null);
  const submittingRef = useRef(false);

  type PendingTask = { id: number; name: string; basePoints: number; starPenalty: number };
  const [step, setStep] = useState<'create' | 'duration'>('create');
  const [pendingTask, setPendingTask] = useState<PendingTask | null>(null);
  const [duration, setDuration] = useState('');
  const [durationUnit, setDurationUnit] = useState<'min' | 'hr'>('min');
  const [customDuration, setCustomDuration] = useState(false);

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
      setDuration('');
      setDurationUnit('min');
      setCustomDuration(false);
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

    const taskBasePoints = isTimeBased
      ? (selectedSuggestion?.basePoints ?? 1)
      : (selectedSuggestion?.basePoints ?? 5);

    try {
      const taskId = await createTask.mutateAsync({
        name: trimmed,
        kind: 'GOOD',
        isTimeBased,
        basePoints: taskBasePoints,
        starPenalty: 0,
        icon: selectedSuggestion?.icon,
      });

      if (isTimeBased) {
        // Advance to duration picker — keep sheet open; dismiss keyboard from name input
        Keyboard.dismiss();
        setPendingTask({ id: taskId, name: trimmed, basePoints: taskBasePoints, starPenalty: 0 });
        setStep('duration');
        submittingRef.current = false;
      } else {
        Toast.show({ type: 'success', text1: t.taskAdded, text2: trimmed, visibilityTime: 2000 });
        handleClose();
      }
    } catch {
      Alert.alert(t.error, t.cantLog);
      submittingRef.current = false;
    }
  }

  async function handleLogDuration(fixedMins?: number) {
    if (!pendingTask) return;
    let mins = fixedMins;
    if (mins === undefined) {
      const parsed = parseInt(duration, 10);
      if (isNaN(parsed) || parsed <= 0) { Alert.alert(t.validDuration); return; }
      mins = durationUnit === 'hr' ? parsed * 60 : parsed;
      if (mins > 1440) { Alert.alert(t.validDuration); return; }
    }
    try {
      await logTask.mutateAsync({
        taskTypeId: pendingTask.id,
        kind: 'GOOD',
        isTimeBased: true,
        basePoints: pendingTask.basePoints,
        starPenalty: pendingTask.starPenalty,
        durationMin: mins,
      });
      Toast.show({ type: 'success', text1: t.taskAdded, text2: pendingTask.name, visibilityTime: 2000 });
      handleClose();
    } catch {
      Alert.alert(t.error, t.cantLog);
    }
  }

  const suggestions = useMemo(() => TEMPLATE_CATEGORIES.flatMap(c => c.tasks), []);

  const hasName = name.trim().length > 0;
  const isPending = createTask.isPending || logTask.isPending;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
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

                <Text style={[styles.durationLabel, !hasName && styles.durationLabelDim]}>
                  {t.addActivityHowLong}
                </Text>

                <TouchableOpacity
                  style={[styles.durationChip, !hasName && styles.durationChipDim]}
                  onPress={() => handleCreate(true)}
                  disabled={!hasName || isPending}
                  activeOpacity={0.8}
                >
                  {createTask.isPending ? (
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
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <ScrollView
                style={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.durationStepTitle}>{pendingTask?.name}</Text>
                <Text style={[styles.durationLabel, { marginTop: 4 }]}>{t.addActivityHowLong}</Text>

                {!customDuration ? (
                  <View style={styles.presetChipsRow}>
                    {([{ label: '30m', mins: 30 }, { label: '45m', mins: 45 }, { label: '1h', mins: 60 }] as const).map(p => (
                      <TouchableOpacity
                        key={p.label}
                        style={styles.presetChip}
                        onPress={() => handleLogDuration(p.mins)}
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
                    <TouchableOpacity style={styles.durationChip} onPress={() => handleLogDuration()} disabled={isPending}>
                      {isPending ? (
                        <ActivityIndicator color={colors.white} />
                      ) : (
                        <Text style={styles.durationChipText}>{t.logBtn}</Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity style={styles.noTimerBtn} onPress={handleClose}>
                  <Text style={styles.noTimerText}>{t.cancel}</Text>
                </TouchableOpacity>

                <View style={{ height: 32 }} />
              </ScrollView>
            </KeyboardAvoidingView>
          )}
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
      fontSize: 11, fontWeight: '700', color: C.muted,
      textTransform: 'uppercase', letterSpacing: 0.7,
      marginTop: Spacing.xl, marginBottom: 10,
    },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      backgroundColor: C.surface2, borderRadius: Radii.pill,
      paddingVertical: 7, paddingHorizontal: 14,
      borderWidth: 1, borderColor: C.line2,
    },
    chipSelected: { borderColor: C.primary, backgroundColor: C.primarySoft },
    chipName: { fontSize: 13, fontWeight: '600', color: C.inkDark },
    chipNameSelected: { color: C.primary },
    durationLabel: {
      ...Typography.bodyStrong, color: C.inkDark,
      marginTop: Spacing.xl, marginBottom: Spacing.sm,
    },
    durationLabelDim: { color: C.muted },
    durationChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.md },
    durationChip: {
      backgroundColor: C.primary, borderRadius: Radii.md,
      paddingVertical: 13, paddingHorizontal: 20,
      alignItems: 'center', justifyContent: 'center',
    },
    durationChipDim: { backgroundColor: C.line2 },
    durationChipText: { color: C.white, fontSize: 15, fontWeight: '700' },
    chipSpinner: { marginVertical: Spacing.lg },
    noTimerBtn: { alignItems: 'center', paddingVertical: 12 },
    noTimerText: { ...Typography.body, color: C.muted, fontWeight: '600' },
    noTimerTextDim: { color: C.faint },

    durationStepTitle: { fontSize: 19, fontWeight: '800', color: C.inkDark, marginTop: Spacing.md, marginBottom: 2 },
    presetChipsRow: { flexDirection: 'row', gap: 10, marginTop: Spacing.md, marginBottom: Spacing.md, flexWrap: 'wrap' },
    presetChip: {
      flex: 1, minWidth: 60, backgroundColor: C.primary,
      borderRadius: Radii.md, paddingVertical: 16,
      alignItems: 'center', justifyContent: 'center',
    },
    presetChipCustom: { backgroundColor: C.surface2, borderWidth: 1.5, borderColor: C.line2 },
    presetChipText: { color: C.white, fontSize: 16, fontWeight: '800' },
    presetChipCustomText: { color: C.inkDark },
    durationRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10, marginBottom: Spacing.md, marginTop: Spacing.md },
    durationInput: { flex: 1, fontSize: 22, fontWeight: '700', textAlign: 'center' },
    unitToggle: { flexDirection: 'column', borderRadius: Radii.md, overflow: 'hidden', borderWidth: 1.5, borderColor: C.line2 },
    unitBtn: { flex: 1, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: C.surface2 },
    unitBtnActive: { backgroundColor: C.primary },
    unitBtnText: { fontSize: 13, fontWeight: '700', color: C.muted },
    unitBtnTextActive: { color: C.white },
  });
}
