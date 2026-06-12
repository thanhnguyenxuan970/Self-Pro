import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  Alert, StyleSheet, ActivityIndicator, Animated, ScrollView,
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

export function AddActivitySheet({ visible, onClose }: Props) {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const createTask = useCreateTask(userId);
  const logTask = useLogTask(userId);

  const [name, setName] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<TemplateTask | null>(null);
  const [step, setStep] = useState<'input' | 'time'>('input');
  const [hoursInput, setHoursInput] = useState('');
  const [minutesInput, setMinutesInput] = useState('');
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

  function handleClose() {
    cueModalClose();
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.spring(sheetTranslateY, { toValue: 300, tension: 120, friction: 12, useNativeDriver: true }),
    ]).start(() => {
      setName('');
      setSelectedSuggestion(null);
      setStep('input');
      setHoursInput('');
      setMinutesInput('');
      submittingRef.current = false;
      onClose();
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(300);
    });
  }

  function handleSuggestionTap(task: TemplateTask) {
    setName(task.name);
    setSelectedSuggestion(task);
  }

  async function handleCreate(isTimeBased: boolean) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const trimmed = name.trim();
    if (!trimmed) { submittingRef.current = false; return; }
    try {
      await createTask.mutateAsync({
        name: trimmed,
        kind: 'GOOD',
        isTimeBased,
        basePoints: isTimeBased
          ? (selectedSuggestion?.basePoints ?? 1)
          : (selectedSuggestion?.basePoints ?? 5),
        starPenalty: 0,
        icon: selectedSuggestion?.icon,
      });
      Toast.show({ type: 'success', text1: t.taskAdded, text2: trimmed, visibilityTime: 2000 });
      handleClose();
    } catch {
      Alert.alert(t.error, t.cantLog);
      submittingRef.current = false;
    }
  }

  async function handleCreateAndLog() {
    if (submittingRef.current) return;
    const hrs = Math.max(0, parseInt(hoursInput, 10) || 0);
    const mins = Math.max(0, parseInt(minutesInput, 10) || 0);
    const totalMin = hrs * 60 + mins;
    if (totalMin <= 0 || hrs > 23 || mins > 59) {
      Alert.alert(t.error, t.validDuration);
      return;
    }
    submittingRef.current = true;
    const trimmed = name.trim();
    const basePoints = selectedSuggestion?.basePoints ?? 1;
    try {
      const taskId = await createTask.mutateAsync({
        name: trimmed,
        kind: 'GOOD',
        isTimeBased: true,
        basePoints,
        starPenalty: 0,
        icon: selectedSuggestion?.icon,
      });
      await logTask.mutateAsync({
        taskTypeId: taskId,
        kind: 'GOOD',
        isTimeBased: true,
        basePoints,
        starPenalty: 0,
        durationMin: totalMin,
      });
      Toast.show({ type: 'success', text1: t.taskAdded, text2: trimmed, visibilityTime: 2000 });
      handleClose();
    } catch {
      Alert.alert(t.error, t.cantLog);
      submittingRef.current = false;
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

          {step === 'input' ? (
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
                      {suggestions.map(s => (
                        <TouchableOpacity
                          key={s.name}
                          style={[styles.chip, name === s.name && styles.chipSelected]}
                          onPress={() => handleSuggestionTap(s)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.chipName, name === s.name && styles.chipNameSelected]}>
                            {s.icon ? `${s.icon} ${s.name}` : s.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                <Text style={[styles.durationLabel, !hasName && styles.durationLabelDim]}>
                  {t.addActivityHowLong}
                </Text>

                <TouchableOpacity
                  style={[styles.durationChip, !hasName && styles.durationChipDim]}
                  onPress={() => { if (hasName) setStep('time'); }}
                  disabled={!hasName || isPending}
                  activeOpacity={0.8}
                >
                  <Text style={styles.durationChipText}>{t.addActivityTimedBtn}</Text>
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
            /* Step 2: time picker */
            <ScrollView
              style={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep('input')} activeOpacity={0.7}>
                <Text style={styles.backBtnText}>{t.back}</Text>
              </TouchableOpacity>

              <Text style={styles.step2Name} numberOfLines={1}>{name.trim()}</Text>
              <Text style={[styles.durationLabel, { marginTop: Spacing.sm }]}>{t.addActivityHowLong}</Text>

              <View style={styles.timeRow}>
                <View style={styles.timeInputWrap}>
                  <TextInput
                    style={styles.timeInput}
                    value={hoursInput}
                    onChangeText={setHoursInput}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.faint}
                    maxLength={2}
                    autoFocus
                  />
                  <Text style={styles.timeInputLabel}>{t.unitHour}</Text>
                </View>
                <Text style={styles.timeSep}>:</Text>
                <View style={styles.timeInputWrap}>
                  <TextInput
                    style={styles.timeInput}
                    value={minutesInput}
                    onChangeText={setMinutesInput}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.faint}
                    maxLength={2}
                  />
                  <Text style={styles.timeInputLabel}>{t.unitMin}</Text>
                </View>
              </View>

              {isPending ? (
                <ActivityIndicator color={colors.primary} size="small" style={styles.chipSpinner} />
              ) : (
                <TouchableOpacity
                  style={styles.createLogBtn}
                  onPress={handleCreateAndLog}
                  disabled={isPending}
                  activeOpacity={0.85}
                >
                  <Text style={styles.createLogBtnText}>{t.addActivityCreateAndLog}</Text>
                </TouchableOpacity>
              )}

              <View style={{ height: 32 }} />
            </ScrollView>
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

    backBtn: { paddingVertical: Spacing.sm, marginTop: Spacing.sm },
    backBtnText: { fontSize: 14, fontWeight: '700', color: C.muted },
    step2Name: { fontSize: 20, fontWeight: '800', color: C.inkDark, marginTop: Spacing.sm },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: Spacing.md, marginBottom: Spacing.md },
    timeInputWrap: { flex: 1, alignItems: 'center' },
    timeInput: {
      width: '100%', textAlign: 'center',
      backgroundColor: C.surface2, color: C.inkDark,
      padding: 14, borderRadius: Radii.md,
      fontSize: 28, fontWeight: '800',
      borderWidth: 1.5, borderColor: C.line2,
    },
    timeInputLabel: { fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 4, textTransform: 'uppercase' },
    timeSep: { fontSize: 24, fontWeight: '800', color: C.muted, paddingBottom: 20 },
    createLogBtn: {
      backgroundColor: C.primary, borderRadius: Radii.md,
      paddingVertical: 15, alignItems: 'center',
    },
    createLogBtnText: { color: C.white, fontSize: 15, fontWeight: '800' },
  });
}
