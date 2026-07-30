import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { AppColors, FontFamily, Radii, Shadows, Spacing, Typography } from '../config/theme';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useTodayTasks } from '../queries/useToday';
import { useCreateChallenge } from '../queries/useChallenge';
import { DurationClockInput } from '../components/DurationClockInput';
import { clockFromMinutes, clockMinutes } from '../utils/durationClock';
import {
  CHALLENGE_DURATIONS, CHALLENGE_NAME_MAX_LENGTH, computeChallengeReward, isValidCustomChallengeValue, PHAO_COUNT,
  THRESHOLD_COUNTS, THRESHOLD_DURATIONS, TOTAL_WEEKS_OPTIONS, WEEKLY_TARGETS,
} from '../config/challenges.config';
import type { ChallengeMode } from '../lib/challenge';

type CustomField = 'days' | 'weeks' | null;

export function CreateChallengeScreen() {
  const { userId, colors, t, styles } = useScreenCommons(makeStyles);
  const { bottom: bottomInset } = useSafeAreaInsets();
  const navigation = useNavigation();
  const { data: tasks = [] } = useTodayTasks(userId);
  const createChallenge = useCreateChallenge(userId);
  const [name, setName] = useState('');
  const [taskTypeId, setTaskTypeId] = useState<number | null>(null);
  const [minDuration, setMinDuration] = useState<number | null>(null);
  const [minCount, setMinCount] = useState<number | null>(null);
  const [mode, setMode] = useState<ChallengeMode>('streak');
  const [targetDays, setTargetDays] = useState<number>(CHALLENGE_DURATIONS[0]);
  const [weeklyTarget, setWeeklyTarget] = useState<number>(WEEKLY_TARGETS[1]);
  const [totalWeeks, setTotalWeeks] = useState<number>(TOTAL_WEEKS_OPTIONS[1]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [customField, setCustomField] = useState<CustomField>(null);
  const [customValue, setCustomValue] = useState('');
  const [customDuration, setCustomDuration] = useState(false);
  const [durationClock, setDurationClock] = useState({ hours: 0, minutes: 0 });

  const reward = useMemo(() => mode === 'streak'
    ? computeChallengeReward({ mode: 'streak', targetDays })
    : computeChallengeReward({ mode: 'weekly', weeklyTarget, totalWeeks }),
  [mode, targetDays, totalWeeks, weeklyTarget]);
  const weeklySessions = weeklyTarget * totalWeeks;
  const startLabel = mode === 'streak'
    ? t.challengeStartStreakCta(targetDays)
    : t.challengeStartWeeksCta(totalWeeks, weeklySessions);

  function openCustom(field: Exclude<CustomField, null>) {
    setCustomValue(String(field === 'days' ? targetDays : totalWeeks));
    setCustomField(field);
  }

  function saveCustom() {
    const value = Number(customValue);
    const valid = customField !== null && isValidCustomChallengeValue(value, customField);
    if (!valid) return;
    if (customField === 'days') setTargetDays(value);
    if (customField === 'weeks') setTotalWeeks(value);
    setCustomField(null);
  }

  function openCustomDuration() {
    setDurationClock(clockFromMinutes(minDuration ?? 0));
    setCustomDuration(true);
  }

  function saveCustomDuration() {
    const value = clockMinutes(durationClock);
    if (value < 1 || value > 1440) return;
    setMinDuration(value);
    setCustomDuration(false);
  }

  async function handleStart() {
    const trimmed = name.trim();
    if (!trimmed) return Alert.alert(t.error, t.challengeNameRequired);
    setSubmitting(true);
    try {
      const { notificationDenied } = await createChallenge.mutateAsync(mode === 'streak' ? {
        name: trimmed, taskTypeId, mode: 'streak', targetDays, freezesLeft: PHAO_COUNT,
        notificationsEnabled, minDuration, minCount,
      } : {
        name: trimmed, taskTypeId, mode: 'weekly', weeklyTarget, totalWeeks, freezesLeft: 0,
        notificationsEnabled, minDuration, minCount,
      });
      if (notificationDenied) {
        Toast.show({ type: 'error', text1: t.reminderScheduleFailed, visibilityTime: 3500 });
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(t.error, e?.message === 'ACTIVE_EXISTS' ? t.challengeAlreadyActive : t.cantLog);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t.challengeNameLabel}</Text>
        <View style={styles.nameWrap}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={CHALLENGE_NAME_MAX_LENGTH}
            placeholder={t.challengeNamePlaceholder}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t.challengeNameLabel}
          />
          <Text style={styles.counter}>{t.challengeNameCount(name.length, CHALLENGE_NAME_MAX_LENGTH)}</Text>
        </View>

        <Text style={styles.label}>{t.challengeHabitLabel}</Text>
        <View style={styles.habitRow}>
          <TouchableOpacity
            style={[styles.habitChip, taskTypeId === null && styles.habitChipOn]}
            onPress={() => { setTaskTypeId(null); setMinDuration(null); setMinCount(null); }}
            activeOpacity={0.75} accessibilityRole="button" accessibilityState={{ selected: taskTypeId === null }}
          ><Text style={[styles.habitChipText, taskTypeId === null && styles.habitChipTextOn]}>{t.challengeHabitNone}</Text></TouchableOpacity>
          {tasks.map(task => {
            const on = taskTypeId === task.id;
            return <TouchableOpacity key={task.id} style={[styles.habitChip, on && styles.habitChipOn]}
              onPress={() => { const next = on ? null : task.id; setTaskTypeId(next); if (next === null) { setMinDuration(null); setMinCount(null); } }}
              activeOpacity={0.75} accessibilityRole="button" accessibilityState={{ selected: on }}
            ><Text style={[styles.habitChipText, on && styles.habitChipTextOn]} numberOfLines={1}>{task.icon ?? '⭐'} {task.name}</Text></TouchableOpacity>;
          })}
        </View>

        {taskTypeId !== null && <View style={styles.thresholds}>
          <Text style={styles.label}>{t.challengeThresholdLabel}</Text>
          <Text style={styles.smallLabel}>{t.challengeThresholdDurationLabel}</Text>
          <View style={styles.chipRow}>{([null, ...THRESHOLD_DURATIONS] as (number | null)[]).map(value => {
            const on = minDuration === value;
            return <TouchableOpacity key={String(value)} style={[styles.chip, on && styles.chipOn]} onPress={() => setMinDuration(value)} accessibilityRole="radio" accessibilityState={{ checked: on }}><Text style={[styles.chipText, on && styles.chipTextOn]}>{value ?? t.challengeThresholdAny}</Text></TouchableOpacity>;
          })}<TouchableOpacity style={styles.customChip} onPress={openCustomDuration} accessibilityRole="button"><Text style={styles.customChipText}>{t.challengeCustom}</Text></TouchableOpacity></View>
          <Text style={styles.smallLabel}>{t.challengeThresholdCountLabel}</Text>
          <View style={styles.chipRow}>{([null, ...THRESHOLD_COUNTS] as (number | null)[]).map(value => {
            const on = minCount === value;
            return <TouchableOpacity key={String(value)} style={[styles.chip, on && styles.chipOn]} onPress={() => setMinCount(value)} accessibilityRole="radio" accessibilityState={{ checked: on }}><Text style={[styles.chipText, on && styles.chipTextOn]}>{value ?? t.challengeThresholdAny}</Text></TouchableOpacity>;
          })}</View>
        </View>}

        <Text style={styles.label}>{t.challengeModeLabel}</Text>
        <View style={styles.modeRow}>
          <TouchableOpacity style={[styles.modeCard, mode === 'streak' && styles.modeCardOn]} onPress={() => setMode('streak')} activeOpacity={0.75} accessibilityRole="radio" accessibilityState={{ checked: mode === 'streak' }}>
            {mode === 'streak' && <View style={styles.modeBadge}><Text style={styles.modeBadgeText}>✓</Text></View>}
            <Text style={styles.modeIcon}>🔥</Text><Text style={[styles.modeTitle, mode === 'streak' && styles.modeTitleOn]}>{t.challengeModeStreak}</Text><Text style={styles.modeSub} numberOfLines={3}>{t.challengeModeStreakDesc}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeCard, mode === 'weekly' && styles.modeCardOn]} onPress={() => setMode('weekly')} activeOpacity={0.75} accessibilityRole="radio" accessibilityState={{ checked: mode === 'weekly' }}>
            {mode === 'weekly' && <View style={styles.modeBadge}><Text style={styles.modeBadgeText}>✓</Text></View>}
            <Text style={styles.modeIcon}>🗓️</Text><Text style={[styles.modeTitle, mode === 'weekly' && styles.modeTitleOn]}>{t.challengeModeWeekly}</Text><Text style={styles.modeSub} numberOfLines={3}>{t.challengeModeWeeklyDesc}</Text>
          </TouchableOpacity>
        </View>

        {mode === 'streak' ? <>
          <Text style={styles.label}>{t.challengeDurationLabel}</Text>
          <View style={styles.chipRow}>{CHALLENGE_DURATIONS.map(value => {
            const on = targetDays === value;
            return <TouchableOpacity key={value} style={[styles.chip, on && styles.chipOn]} onPress={() => setTargetDays(value)} accessibilityRole="radio" accessibilityState={{ checked: on }}><Text style={[styles.chipText, on && styles.chipTextOn]}>{t.challengeDurationDays(value)}</Text></TouchableOpacity>;
          })}<TouchableOpacity style={styles.customChip} onPress={() => openCustom('days')} accessibilityRole="button"><Text style={styles.customChipText}>{t.challengeCustom}</Text></TouchableOpacity></View>
        </> : <>
          <Text style={styles.label}>{t.challengeWeeklyTargetLabel}</Text>
          <View style={styles.chipRow}>{WEEKLY_TARGETS.map(value => {
            const on = weeklyTarget === value;
            return <TouchableOpacity key={value} style={[styles.chip, on && styles.chipOn]} onPress={() => setWeeklyTarget(value)} accessibilityRole="radio" accessibilityState={{ checked: on }}><Text style={[styles.chipText, on && styles.chipTextOn]}>{value}</Text></TouchableOpacity>;
          })}</View>
          <Text style={styles.label}>{t.challengeTotalWeeksLabel}</Text>
          <View style={styles.chipRow}>{TOTAL_WEEKS_OPTIONS.map(value => {
            const on = totalWeeks === value;
            return <TouchableOpacity key={value} style={[styles.chip, on && styles.chipOn]} onPress={() => setTotalWeeks(value)} accessibilityRole="radio" accessibilityState={{ checked: on }}><Text style={[styles.chipText, on && styles.chipTextOn]}>{value}</Text></TouchableOpacity>;
          })}<TouchableOpacity style={styles.customChip} onPress={() => openCustom('weeks')} accessibilityRole="button"><Text style={styles.customChipText}>{t.challengeCustom}</Text></TouchableOpacity></View>
        </>}

        <View style={styles.notifyRow}>
          <View style={styles.notifyCopy}><Text style={styles.notifyLabel}>{mode === 'streak' ? t.challengeNotifyLabel : t.challengeNotifyWeeklyLabel}</Text><Text style={styles.notifyDesc}>{mode === 'streak' ? t.challengeNotifyDesc : t.challengeNotifyWeeklyDesc}</Text></View>
          <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} thumbColor={colors.white} trackColor={{ false: colors.line2, true: colors.primary }} accessibilityLabel={mode === 'streak' ? t.challengeNotifyLabel : t.challengeNotifyWeeklyLabel} />
        </View>

        <View style={styles.rewardCard}>
          <Text style={styles.rewardTitle}>{t.challengeRewardPreviewTitle}</Text>
          <View style={styles.rewardRow}><View style={styles.rewardItem}><Text style={styles.rewardValue}>★ +{reward.stars}</Text><Text style={styles.rewardLabel}>{t.challengeRewardStars}</Text></View><View style={styles.rewardItem}><Text style={styles.rewardValue}>🏅</Text><Text style={styles.rewardLabel} numberOfLines={1}>{t.challengeRewardBadge}</Text></View></View>
        </View>

        <View style={styles.rulesWrap}><View style={styles.rulesHeader}><Text style={styles.rulesTitle}>{t.challengeRulesTitle}</Text><Text style={styles.ruleTag}>{mode === 'streak' ? t.challengeRulesStreakTag : t.challengeRulesWeeklyTag}</Text></View><View style={styles.rulesCard}><Text style={styles.rulesIcon}>{mode === 'streak' ? '🔥' : '🗓️'}</Text><Text style={styles.rulesBody}>{mode === 'streak' ? t.challengeRulesBody(PHAO_COUNT) : t.challengeWeeklyRulesBody(weeklyTarget)}</Text></View></View>
      </ScrollView>

      <View style={styles.sticky}><TouchableOpacity style={[styles.startBtn, submitting && styles.startBtnDisabled]} onPress={handleStart} disabled={submitting} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={startLabel}>{submitting ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.startBtnText} numberOfLines={1}>{startLabel}</Text>}</TouchableOpacity></View>

      <Modal visible={customField !== null || customDuration} transparent animationType="fade" onRequestClose={() => { setCustomField(null); setCustomDuration(false); }} statusBarTranslucent navigationBarTranslucent>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><View style={[styles.customSheet, { paddingBottom: Spacing.lg + bottomInset }]}><Text style={styles.customTitle}>{customDuration ? t.challengeThresholdDurationLabel : customField === 'days' ? t.challengeDurationLabel : t.challengeTotalWeeksLabel}</Text>{customDuration ? <DurationClockInput value={durationClock} onChange={setDurationClock} colors={colors} /> : <TextInput style={styles.customInput} value={customValue} onChangeText={setCustomValue} keyboardType="number-pad" placeholder={t.challengeCustomPlaceholder} placeholderTextColor={colors.muted} autoFocus />}<TouchableOpacity style={styles.customSave} onPress={customDuration ? saveCustomDuration : saveCustom} accessibilityRole="button"><Text style={styles.customSaveText}>{t.challengeCustomSave}</Text></TouchableOpacity></View></KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgBase }, scrollContent: { padding: Spacing.lg, gap: Spacing.xs, paddingBottom: Spacing.lg },
    label: { ...Typography.sectionLabel, color: C.ink2, marginTop: Spacing.md, marginBottom: Spacing.xs }, smallLabel: { ...Typography.caption, color: C.muted, marginTop: Spacing.xs, marginBottom: Spacing.xs },
    nameWrap: { position: 'relative' }, input: { backgroundColor: C.surface, borderRadius: Radii.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 12, paddingRight: 58, fontSize: 15, fontFamily: FontFamily.regular, color: C.inkDark }, counter: { ...Typography.caption, color: C.muted, position: 'absolute', right: 12, top: 14 },
    habitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }, habitChip: { maxWidth: 190, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radii.pill, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }, habitChipOn: { backgroundColor: C.primarySoft, borderColor: C.primary }, habitChipText: { ...Typography.bodyStrong, color: C.ink2 }, habitChipTextOn: { color: C.primary },
    thresholds: { gap: Spacing.xs }, modeRow: { flexDirection: 'row', gap: Spacing.sm }, modeCard: { flex: 1, minHeight: 148, padding: Spacing.sm, borderRadius: Radii.lg, borderWidth: 1, borderColor: C.line2, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 4 }, modeCardOn: { backgroundColor: C.primarySoft, borderColor: C.primary }, modeBadge: { position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, modeBadgeText: { color: C.onAccent, fontFamily: FontFamily.bold, fontSize: 12 }, modeIcon: { fontSize: 25 }, modeTitle: { ...Typography.bodyStrong, color: C.inkDark, textAlign: 'center' }, modeTitleOn: { color: C.primary }, modeSub: { ...Typography.caption, color: C.ink2, textAlign: 'center' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }, chip: { minHeight: 44, paddingHorizontal: Spacing.md, justifyContent: 'center', borderRadius: Radii.pill, borderWidth: 1, borderColor: C.line2, backgroundColor: C.surface }, chipOn: { backgroundColor: C.primarySoft, borderColor: C.primary }, chipText: { ...Typography.bodyStrong, color: C.ink2 }, chipTextOn: { color: C.primary }, customChip: { minHeight: 44, paddingHorizontal: Spacing.md, justifyContent: 'center', borderRadius: Radii.pill, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2 }, customChipText: { ...Typography.bodyStrong, color: C.muted },
    notifyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: C.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: C.line, padding: Spacing.md, marginTop: Spacing.lg }, notifyCopy: { flex: 1 }, notifyLabel: { ...Typography.bodyStrong, color: C.inkDark }, notifyDesc: { ...Typography.secondary, color: C.ink2, marginTop: 2 },
    rewardCard: { backgroundColor: C.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: C.starGold, padding: Spacing.md, marginTop: Spacing.lg }, rewardTitle: { ...Typography.sectionLabel, color: C.starGoldText, marginBottom: Spacing.sm }, rewardRow: { flexDirection: 'row', gap: Spacing.sm }, rewardItem: { flex: 1, minWidth: 0, borderRadius: Radii.md, backgroundColor: C.surface2, padding: Spacing.sm }, rewardValue: { ...Typography.bodyStrong, color: C.inkDark }, rewardLabel: { ...Typography.caption, color: C.ink2 },
    rulesWrap: { marginTop: Spacing.lg }, rulesHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs }, rulesTitle: { ...Typography.bodyStrong, color: C.inkDark }, ruleTag: { ...Typography.caption, color: C.primary, fontFamily: FontFamily.bold, borderWidth: 1, borderColor: C.primary, borderRadius: Radii.pill, paddingHorizontal: Spacing.xs }, rulesCard: { flexDirection: 'row', gap: Spacing.sm, backgroundColor: C.surface2, borderRadius: Radii.lg, padding: Spacing.md }, rulesIcon: { fontSize: 20 }, rulesBody: { ...Typography.secondary, color: C.ink2, flex: 1, lineHeight: 19 },
    sticky: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: C.bgBase, borderTopWidth: 1, borderTopColor: C.line }, startBtn: { minHeight: 52, backgroundColor: C.primary, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', ...Shadows.medium }, startBtnDisabled: { opacity: 0.65 }, startBtnText: { ...Typography.bodyStrong, color: C.onAccent, fontSize: 16 },
    modalBackdrop: { flex: 1, backgroundColor: C.scrim, justifyContent: 'flex-end', padding: Spacing.lg }, customSheet: { backgroundColor: C.surface, borderRadius: Radii.xl, padding: Spacing.lg, gap: Spacing.md, alignSelf: 'center', width: '100%', maxWidth: 480 }, customTitle: { ...Typography.subheading, color: C.inkDark }, customInput: { ...Typography.body, color: C.inkDark, borderWidth: 1, borderColor: C.line, borderRadius: Radii.md, paddingHorizontal: Spacing.md, paddingVertical: 12 }, customSave: { minHeight: 48, borderRadius: Radii.md, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, customSaveText: { ...Typography.bodyStrong, color: C.onAccent },
  });
}
