import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  Alert, StyleSheet, ActivityIndicator, Animated, ScrollView,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useTodayTasks } from '../queries/useToday';
import { useCreateTask } from '../queries/useTasks';
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

  const { data: existingTasks = [] } = useTodayTasks(userId);
  const createTask = useCreateTask(userId);

  const [step, setStep] = useState<'name' | 'duration'>('name');
  const [name, setName] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<TemplateTask | null>(null);
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
      setStep('name');
      setName('');
      setSelectedSuggestion(null);
      submittingRef.current = false;
      onClose();
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(300);
    });
  }

  function handleNext() {
    if (!name.trim()) return;
    setStep('duration');
  }

  function handleSuggestionTap(task: TemplateTask) {
    setName(task.name);
    setSelectedSuggestion(task);
    setStep('duration');
  }

  function handleBack() {
    setStep('name');
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

  const existingNames = useMemo(
    () => new Set(existingTasks.map(task => task.name.toLowerCase())),
    [existingTasks]
  );

  const suggestions = useMemo(() => {
    const result: TemplateTask[] = [];
    for (const cat of TEMPLATE_CATEGORIES) {
      for (const task of cat.tasks) {
        if (!existingNames.has(task.name.toLowerCase())) {
          result.push(task);
        }
      }
    }
    return result;
  }, [existingNames]);

  const isPending = createTask.isPending;

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
              <Text style={styles.title}>{t.addActivityTitle}</Text>
              <ScrollView
                style={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder={t.addActivityNamePlaceholder}
                    placeholderTextColor={colors.faint}
                    returnKeyType="next"
                    onSubmitEditing={handleNext}
                  />
                  <TouchableOpacity
                    style={[styles.nextBtn, !name.trim() && styles.nextBtnDisabled]}
                    onPress={handleNext}
                    disabled={!name.trim()}
                  >
                    <Text style={styles.nextBtnText}>→</Text>
                  </TouchableOpacity>
                </View>

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
                <View style={{ height: 32 }} />
              </ScrollView>
            </>
          ) : (
            <>
              <View style={styles.step2Header}>
                <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
                  <Text style={styles.backText}>{t.back}</Text>
                </TouchableOpacity>
                <Text style={styles.step2Name}>{name.trim()}</Text>
              </View>

              <View style={styles.durationBody}>
                <Text style={styles.durationLabel}>{t.addActivityHowLong}</Text>

                {isPending ? (
                  <ActivityIndicator color={colors.primary} size="small" style={styles.chipSpinner} />
                ) : (
                  <View style={styles.durationChipsWrap}>
                    {[`15 ${t.unitMin.toLowerCase()}`, `30 ${t.unitMin.toLowerCase()}`, `45 ${t.unitMin.toLowerCase()}`, `1 ${t.unitHour.toLowerCase()}`, `2 ${t.unitHour.toLowerCase()}`].map(label => (
                      <TouchableOpacity
                        key={label}
                        style={styles.durationChip}
                        onPress={() => handleCreate(true)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.durationChipText}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  style={styles.noTimerBtn}
                  onPress={() => handleCreate(false)}
                  disabled={isPending}
                >
                  <Text style={styles.noTimerText}>{t.addActivityNoTimer}</Text>
                </TouchableOpacity>
              </View>
            </>
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
    inputRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginTop: Spacing.md,
    },
    input: {
      flex: 1, backgroundColor: C.surface2, color: C.inkDark, padding: 13,
      borderRadius: Radii.md, fontSize: 14,
      borderWidth: 1.5, borderColor: C.line2,
    },
    nextBtn: {
      backgroundColor: C.primary, borderRadius: Radii.md,
      width: 46, height: 46, alignItems: 'center', justifyContent: 'center',
    },
    nextBtnDisabled: { backgroundColor: C.line2 },
    nextBtnText: { color: C.white, fontSize: 20, fontWeight: '700' },
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
    // Step 2
    step2Header: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.sm,
      borderBottomWidth: 1,
      borderColor: C.line,
    },
    backBtn: { paddingBottom: Spacing.xs },
    backText: { ...Typography.body, color: C.primary, fontWeight: '600' },
    step2Name: { fontSize: 18, fontWeight: '700', color: C.inkDark },
    durationBody: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.xl,
    },
    durationLabel: {
      ...Typography.bodyStrong, color: C.inkDark,
      marginBottom: Spacing.sm,
    },
    durationChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.md },
    durationChip: {
      backgroundColor: C.primary, borderRadius: Radii.md,
      paddingVertical: 13, paddingHorizontal: 20,
      alignItems: 'center', justifyContent: 'center',
    },
    durationChipText: { color: C.white, fontSize: 15, fontWeight: '700' },
    chipSpinner: { marginVertical: Spacing.lg },
    noTimerBtn: {
      alignItems: 'center', paddingVertical: 12,
    },
    noTimerText: { ...Typography.body, color: C.muted, fontWeight: '600' },
  });
}
