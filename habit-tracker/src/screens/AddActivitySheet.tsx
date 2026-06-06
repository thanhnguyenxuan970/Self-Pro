import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, Alert, StyleSheet, ActivityIndicator, Animated,
  Switch,
} from 'react-native';
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

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [kind, setKind] = useState<'GOOD' | 'BAD'>('GOOD');
  const [isTimeBased, setIsTimeBased] = useState(false);

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
      resetForm();
      onClose();
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(300);
    });
  }

  function resetForm() {
    setName('');
    setIcon('');
    setKind('GOOD');
    setIsTimeBased(false);
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert(t.error, t.addActivityEmptyName); return; }
    try {
      await createTask.mutateAsync({
        name: trimmed,
        kind,
        isTimeBased,
        basePoints: isTimeBased ? 1 : 5,
        starPenalty: kind === 'BAD' ? 1 : 0,
        icon: icon.trim() || undefined,
      });
      handleClose();
    } catch { Alert.alert(t.error, t.cantLog); }
  }

  async function handleSuggestionTap(task: TemplateTask) {
    try {
      await createTask.mutateAsync({
        name: task.name,
        kind: task.kind,
        isTimeBased: task.isTimeBased,
        basePoints: task.basePoints,
        starPenalty: task.starPenalty,
        icon: task.icon,
      });
    } catch { Alert.alert(t.error, t.cantLog); }
  }

  const existingNames = useMemo(
    () => new Set(existingTasks.map(t => t.name.toLowerCase())),
    [existingTasks]
  );

  const suggestions = useMemo((): (TemplateTask & { category: string })[] => {
    const result: (TemplateTask & { category: string })[] = [];
    for (const cat of TEMPLATE_CATEGORIES) {
      for (const task of cat.tasks) {
        if (!existingNames.has(task.name.toLowerCase())) {
          result.push({ ...task, category: cat.name });
        }
      }
    }
    return result;
  }, [existingNames]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: backdropOpacity }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1} />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t.addActivityTitle}</Text>

          <ScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Name */}
            <Text style={styles.fieldLabel}>{t.addActivityNameLabel}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t.addActivityNamePlaceholder}
              placeholderTextColor={colors.faint}
              autoFocus={false}
              returnKeyType="done"
            />

            {/* Icon */}
            <Text style={styles.fieldLabel}>{t.addActivityIconLabel}</Text>
            <TextInput
              style={[styles.input, styles.iconInput]}
              value={icon}
              onChangeText={setIcon}
              placeholder={t.addActivityIconPlaceholder}
              placeholderTextColor={colors.faint}
              maxLength={4}
            />

            {/* Kind toggle */}
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.kindBtn, kind === 'GOOD' && styles.kindBtnActive]}
                onPress={() => setKind('GOOD')}
                activeOpacity={0.7}
              >
                <Text style={[styles.kindBtnText, kind === 'GOOD' && styles.kindBtnTextActive]}>
                  {t.addActivityKindGood}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.kindBtn, kind === 'BAD' && styles.kindBtnBad]}
                onPress={() => setKind('BAD')}
                activeOpacity={0.7}
              >
                <Text style={[styles.kindBtnText, kind === 'BAD' && styles.kindBtnTextBad]}>
                  {t.addActivityKindBad}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Time-based switch */}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t.addActivityTimedLabel}</Text>
              <Switch
                value={isTimeBased}
                onValueChange={setIsTimeBased}
                trackColor={{ false: colors.line2, true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>

            {/* Save button */}
            <TouchableOpacity
              style={[styles.saveBtn, createTask.isPending && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={createTask.isPending}
              activeOpacity={0.8}
            >
              {createTask.isPending ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.saveBtnText}>{t.addActivitySave}</Text>
              )}
            </TouchableOpacity>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <>
                <Text style={styles.suggestionsTitle}>{t.addActivitySuggestionsTitle}</Text>
                <View style={styles.chipsWrap}>
                  {suggestions.map(s => (
                    <TouchableOpacity
                      key={s.name}
                      style={styles.chip}
                      onPress={() => handleSuggestionTap(s)}
                      disabled={createTask.isPending}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.chipIcon}>{s.icon}</Text>
                      <Text style={styles.chipName}>{s.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>
        </Animated.View>
      </View>
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
      maxHeight: '88%',
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
    fieldLabel: {
      fontSize: 12, fontWeight: '700', color: C.muted,
      textTransform: 'uppercase', letterSpacing: 0.6,
      marginTop: Spacing.md, marginBottom: 6,
    },
    input: {
      backgroundColor: C.surface2, color: C.inkDark, padding: 13,
      borderRadius: Radii.md, fontSize: 14,
      borderWidth: 1.5, borderColor: C.line2,
    },
    iconInput: { fontSize: 22, textAlign: 'center' },
    toggleRow: { flexDirection: 'row', gap: 10, marginTop: Spacing.md },
    kindBtn: {
      flex: 1, paddingVertical: 11, borderRadius: Radii.md,
      alignItems: 'center', borderWidth: 1.5, borderColor: C.line2,
      backgroundColor: C.surface2,
    },
    kindBtnActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
    kindBtnBad:    { borderColor: C.danger, backgroundColor: C.dangerSoft },
    kindBtnText: { fontSize: 13, fontWeight: '700', color: C.inkDark },
    kindBtnTextActive: { color: C.primaryPress },
    kindBtnTextBad:    { color: C.danger },
    switchRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: Spacing.md,
    },
    switchLabel: { fontSize: 13, fontWeight: '600', color: C.inkDark, flex: 1, paddingRight: 10 },
    saveBtn: {
      marginTop: Spacing.lg, backgroundColor: C.primary,
      borderRadius: Radii.md, paddingVertical: 15,
      alignItems: 'center', ...Shadows.light,
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { color: C.white, fontWeight: '700', fontSize: 15 },
    suggestionsTitle: {
      fontSize: 11, fontWeight: '700', color: C.muted,
      textTransform: 'uppercase', letterSpacing: 0.7,
      marginTop: Spacing.xl, marginBottom: 10,
    },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: C.surface2, borderRadius: Radii.pill,
      paddingVertical: 7, paddingHorizontal: 12,
      borderWidth: 1, borderColor: C.line2,
    },
    chipIcon: { fontSize: 16 },
    chipName: { fontSize: 13, fontWeight: '600', color: C.inkDark },
  });
}
