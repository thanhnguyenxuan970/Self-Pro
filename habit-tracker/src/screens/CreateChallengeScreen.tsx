import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { AppColors, FontFamily, Radii, Shadows, Spacing, Typography } from '../config/theme';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useTodayTasks } from '../queries/useToday';
import { useCreateChallenge } from '../queries/useChallenge';
import { CHALLENGE_DURATIONS, PHAO_COUNT, CHALLENGE_NAME_MAX_LENGTH } from '../config/challenges.config';

export function CreateChallengeScreen() {
  const { userId, colors, t, styles } = useScreenCommons(makeStyles);
  const navigation = useNavigation();
  const { data: tasks = [] } = useTodayTasks(userId);
  const createChallenge = useCreateChallenge(userId);

  const [name, setName] = useState('');
  const [taskTypeId, setTaskTypeId] = useState<number | null>(null);
  const [targetDays, setTargetDays] = useState<number>(CHALLENGE_DURATIONS[0]);
  const [beforePhoto, setBeforePhoto] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function pickBeforePhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) setBeforePhoto(result.assets[0].uri);
  }

  async function handleStart() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert(t.error, t.challengeNameRequired);
      return;
    }
    setSubmitting(true);
    try {
      await createChallenge.mutateAsync({
        name: trimmed,
        taskTypeId,
        targetDays,
        freezesLeft: PHAO_COUNT,
        beforePhoto,
        notificationsEnabled,
      });
      navigation.goBack();
    } catch (e: any) {
      if (e?.message === 'ACTIVE_EXISTS') {
        Alert.alert(t.error, t.challengeAlreadyActive);
      } else {
        Alert.alert(t.error, t.cantLog);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t.challengeNameLabel}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          maxLength={CHALLENGE_NAME_MAX_LENGTH}
          placeholder={t.challengeNamePlaceholder}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t.challengeNameLabel}
        />

        <Text style={styles.label}>{t.challengeHabitLabel}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.habitRow} contentContainerStyle={{ gap: Spacing.sm }}>
          <TouchableOpacity
            style={[styles.habitChip, taskTypeId === null && styles.habitChipOn]}
            onPress={() => setTaskTypeId(null)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ selected: taskTypeId === null }}
          >
            <Text style={[styles.habitChipText, taskTypeId === null && styles.habitChipTextOn]}>{t.challengeHabitNone}</Text>
          </TouchableOpacity>
          {tasks.map(task => {
            const on = taskTypeId === task.id;
            return (
              <TouchableOpacity
                key={task.id}
                style={[styles.habitChip, on && styles.habitChipOn]}
                onPress={() => setTaskTypeId(on ? null : task.id)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.habitChipText, on && styles.habitChipTextOn]}>{task.icon ?? '⭐'} {task.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.label}>{t.challengeDurationLabel}</Text>
        <View style={styles.durationRow}>
          {CHALLENGE_DURATIONS.map(d => {
            const on = targetDays === d;
            return (
              <TouchableOpacity
                key={d}
                style={[styles.durChip, on && styles.durChipOn]}
                onPress={() => setTargetDays(d)}
                activeOpacity={0.75}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <Text style={[styles.durChipText, on && styles.durChipTextOn]}>{t.challengeDurationDays(d)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>{t.challengeBeforePhotoLabel}</Text>
        <TouchableOpacity
          style={[styles.photoBtn, beforePhoto && { borderColor: colors.primary }]}
          onPress={pickBeforePhoto}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t.challengeAddPhoto}
        >
          <Text style={[styles.photoBtnText, beforePhoto && { color: colors.primary }]}>
            {beforePhoto ? '✓' : '📷'} {t.challengeAddPhoto}
          </Text>
        </TouchableOpacity>

        <View style={styles.notifyRow}>
          <View style={styles.notifyTextCol}>
            <Text style={styles.notifyLabel}>{t.challengeNotifyLabel}</Text>
            <Text style={styles.notifyDesc}>{t.challengeNotifyDesc}</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            thumbColor={notificationsEnabled ? colors.primary : colors.faint}
            trackColor={{ false: colors.line2, true: colors.primarySoft }}
            accessibilityLabel={t.challengeNotifyLabel}
          />
        </View>

        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>{t.challengeRulesTitle}</Text>
          <Text style={styles.rulesBody}>{t.challengeRulesBody(PHAO_COUNT)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.startBtn, submitting && styles.startBtnDisabled]}
          onPress={handleStart}
          disabled={submitting}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t.challengeStartCta}
        >
          {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.startBtnText}>{t.challengeStartCta}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgBase },
    scrollContent: { padding: Spacing.lg, gap: Spacing.xs, paddingBottom: Spacing.xl },
    label: { ...Typography.sectionLabel, color: C.ink2, marginTop: Spacing.md, marginBottom: Spacing.xs },
    input: {
      backgroundColor: C.surface, borderRadius: Radii.md, borderWidth: 1, borderColor: C.line,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: FontFamily.regular, color: C.inkDark,
    },
    habitRow: { flexGrow: 0 },
    habitChip: {
      paddingHorizontal: Spacing.md, paddingVertical: 11, borderRadius: Radii.pill,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
    },
    habitChipOn: { backgroundColor: C.primarySoft, borderColor: C.primary },
    habitChipText: { ...Typography.body, color: C.ink2 },
    habitChipTextOn: { color: C.primary, fontFamily: FontFamily.semiBold },
    durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    durChip: {
      paddingHorizontal: Spacing.lg, paddingVertical: 12, borderRadius: Radii.md,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
    },
    durChipOn: { backgroundColor: C.primarySoft, borderColor: C.primary },
    durChipText: { ...Typography.bodyStrong, color: C.ink2 },
    durChipTextOn: { color: C.primary },
    photoBtn: {
      paddingVertical: 14, borderRadius: Radii.lg, borderWidth: 1.5, borderColor: C.line,
      alignItems: 'center', backgroundColor: C.surface,
    },
    photoBtnText: { ...Typography.bodyStrong, color: C.ink2 },
    notifyRow: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
      backgroundColor: C.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: C.line,
      padding: Spacing.md, marginTop: Spacing.lg,
    },
    notifyTextCol: { flex: 1 },
    notifyLabel: { ...Typography.bodyStrong, color: C.inkDark },
    notifyDesc: { ...Typography.secondary, color: C.ink2, marginTop: 2 },
    rulesCard: { backgroundColor: C.surface2, borderRadius: Radii.lg, padding: Spacing.md, marginTop: Spacing.lg },
    rulesTitle: { ...Typography.bodyStrong, color: C.inkDark, marginBottom: 4 },
    rulesBody: { ...Typography.secondary, color: C.ink2, lineHeight: 19 },
    startBtn: {
      marginTop: Spacing.lg, backgroundColor: C.primary, paddingVertical: 16, borderRadius: Radii.pill,
      alignItems: 'center', ...Shadows.medium,
    },
    startBtnDisabled: { opacity: 0.65 },
    startBtnText: { ...Typography.bodyStrong, color: C.white, fontSize: 16 },
  });
}
