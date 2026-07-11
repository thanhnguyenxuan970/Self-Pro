import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Switch, TouchableOpacity, Alert, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Radii, Spacing, Shadows, Typography, AppColors, FontFamily } from '../config/theme';
import { useDarkMode, useLanguage, useAudioEnabled, AppLanguage, useTheme, useTranslations } from '../hooks/useSettings';
import { useAuthUser } from '../hooks/useAuth';
import {
  useNotificationTime, useSetNotificationTime,
  useNotificationTime2, useSetNotificationTime2,
  useNotificationTime3, useSetNotificationTime3,
} from '../queries/useSettings';
import { scheduleAllHabitReminders } from '../utils/notifications';
import { FeedbackSheet } from './FeedbackSheet';

type Props = {
  onDeleteAccount: (userId: number) => Promise<void>;
};

function openTimePicker(currentVal: string | null, onSet: (time: string) => void) {
  if (Platform.OS !== 'android') return;
  const date = new Date();
  if (currentVal) {
    const [h, m] = currentVal.split(':').map(Number);
    date.setHours(h, m, 0, 0);
  }
  DateTimePickerAndroid.open({
    mode: 'time',
    value: date,
    is24Hour: true,
    onValueChange: (_event, selectedDate) => {
      if (selectedDate) {
        const hh = String(selectedDate.getHours()).padStart(2, '0');
        const mm = String(selectedDate.getMinutes()).padStart(2, '0');
        onSet(`${hh}:${mm}`);
      }
    },
  });
}

function LanguageOption({ lang, l, isLast, onPress, styles }: { lang: string; l: AppLanguage; isLast: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return (
    <TouchableOpacity
      style={[styles.row, isLast && styles.rowLast]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="radio"
      accessibilityLabel={l === 'vi' ? 'Tiếng Việt' : 'English'}
      accessibilityState={{ checked: lang === l }}
    >
      <Text style={styles.rowIc}>{l === 'vi' ? '🇻🇳' : '🇬🇧'}</Text>
      <Text style={styles.rowLabel}>{l === 'vi' ? 'Tiếng Việt' : 'English'}</Text>
      {lang === l && <Text style={styles.check}>✓</Text>}
    </TouchableOpacity>
  );
}

export function SettingsScreen({ onDeleteAccount }: Props) {
  const userId = useAuthUser();
  const [isDark, setIsDark] = useDarkMode();
  const [lang, setLanguage] = useLanguage();
  const [audioEnabled, setAudioEnabled] = useAudioEnabled();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [deleting, setDeleting] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);

  const { data: savedNotifTime } = useNotificationTime(userId);
  const setNotifTimeMutation = useSetNotificationTime(userId);
  const { data: savedNotifTime2 } = useNotificationTime2(userId);
  const setNotifTimeMutation2 = useSetNotificationTime2(userId);
  const { data: savedNotifTime3 } = useNotificationTime3(userId);
  const setNotifTimeMutation3 = useSetNotificationTime3(userId);

  const savedTimes: (string | null)[] = [
    savedNotifTime ?? null,
    savedNotifTime2 ?? null,
    savedNotifTime3 ?? null,
  ];
  const notifMutations = [setNotifTimeMutation, setNotifTimeMutation2, setNotifTimeMutation3];

  function handleSetReminder(idx: number, time: string) {
    notifMutations[idx].mutate(time);
    const updated = savedTimes.map((v, i) => (i === idx ? time : v));
    scheduleAllHabitReminders(updated).catch(() => {});
  }

  function handleClearReminder(idx: number) {
    notifMutations[idx].mutate(null);
    const updated = savedTimes.map((v, i) => (i === idx ? null : v));
    scheduleAllHabitReminders(updated).catch(() => {});
  }

  function handleOpenPicker(idx: number) {
    openTimePicker(savedTimes[idx], (time) => handleSetReminder(idx, time));
  }

  function handleAddReminder() {
    const nextIdx = savedTimes.findIndex(v => !v);
    if (nextIdx === -1) return;
    openTimePicker(null, (time) => handleSetReminder(nextIdx, time));
  }

  function handleDeleteAccount() {
    Alert.alert(
      t.deleteAccountTitle,
      t.deleteAccountMsg,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.deleteAccountBtn,
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await onDeleteAccount(userId);
            } catch {
              Alert.alert(t.error, t.deleteAccountError);
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Appearance */}
        <Text style={styles.sectionLabel}>{t.sectionAppearance}</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.rowIc}>🌙</Text>
            <Text style={styles.rowLabel}>{t.darkModeLabel}</Text>
            <Switch
              value={isDark}
              onValueChange={setIsDark}
              thumbColor={isDark ? colors.primary : colors.faint}
              trackColor={{ false: colors.line2, true: colors.primarySoft }}
              accessibilityLabel={t.darkModeLabel}
            />
          </View>
        </View>

        {/* Sound */}
        <Text style={styles.sectionLabel}>{t.sectionSound}</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.rowIc}>🔊</Text>
            <Text style={styles.rowLabel}>{t.soundEnabledLabel}</Text>
            <Switch
              value={audioEnabled}
              onValueChange={setAudioEnabled}
              thumbColor={audioEnabled ? colors.primary : colors.faint}
              trackColor={{ false: colors.line2, true: colors.primarySoft }}
              accessibilityLabel={t.soundEnabledLabel}
            />
          </View>
        </View>

        {/* Language */}
        <Text style={styles.sectionLabel}>{t.sectionLanguage}</Text>
        <View style={styles.card} accessibilityRole="radiogroup">
          {(['vi', 'en'] as AppLanguage[]).map((l, idx) => (
            <LanguageOption
              key={l}
              lang={lang}
              l={l}
              isLast={idx === 1}
              onPress={() => setLanguage(l)}
              styles={styles}
            />
          ))}
        </View>

        {/* Notification */}
        <Text style={styles.sectionLabel}>{t.sectionNotifications}</Text>
        <View style={styles.card}>
          {savedTimes.map((time, idx) => {
            if (!time) return null;
            const canAddMore = savedTimes.filter(Boolean).length < 3;
            const isLast = !canAddMore && !savedTimes.slice(idx + 1).some(Boolean);
            return (
              <View key={idx} style={[styles.row, isLast && styles.rowLast]}>
                <TouchableOpacity
                  style={styles.reminderMain}
                  onPress={() => handleOpenPicker(idx)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={time}
                >
                  <Text style={styles.rowIc}>🔔</Text>
                  <Text style={[styles.rowLabel, styles.reminderTime]}>{time}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleClearReminder(idx)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t.clearReminder}
                >
                  <Text style={styles.reminderClear}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          {savedTimes.filter(Boolean).length < 3 && (
            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              onPress={handleAddReminder}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={[styles.rowLabel, styles.addReminderText]}>{t.addReminder}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Feedback */}
        <Text style={styles.sectionLabel}>{t.sectionFeedback}</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.row, styles.rowLast]}
            onPress={() => setFeedbackVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.rowIc}>📬</Text>
            <Text style={styles.rowLabel}>{t.reportBugLabel}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Danger zone */}
        <Text style={styles.sectionLabel}>{t.sectionAccount}</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.row, styles.rowLast, { opacity: deleting ? 0.5 : 1 }]}
            onPress={handleDeleteAccount}
            disabled={deleting}
            activeOpacity={0.7}
          >
            <Text style={styles.rowIc}>🗑️</Text>
            <Text style={[styles.rowLabel, { color: colors.danger }]}>{t.deleteAccountLabel}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>{t.deleteAccountNote}</Text>
      </ScrollView>
      <FeedbackSheet visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgBase },
    sectionLabel: {
      ...Typography.sectionLabel,
      color: C.ink2,
      marginHorizontal: Spacing.lg,
      marginTop: 24,
      marginBottom: 8,
    },
    card: {
      marginHorizontal: Spacing.lg,
      backgroundColor: C.surface,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: C.line,
      paddingHorizontal: 15,
      ...Shadows.light,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderColor: C.line,
      gap: 13,
    },
    rowLast: { borderBottomWidth: 0 },
    rowIc: { fontSize: 20, width: 28, textAlign: 'center' },
    rowLabel: { flex: 1, fontSize: 15, fontFamily: FontFamily.semiBold, color: C.inkDark },
    check: { fontSize: 16, fontFamily: FontFamily.extraBold, color: C.primary },
    chevron: { fontSize: 18, color: C.muted },
    hint: {
      marginHorizontal: Spacing.lg,
      marginTop: 12,
      fontSize: 12,
      color: C.ink2,
      lineHeight: 18,
    },
    reminderMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    reminderTime: {
      fontSize: 17,
      fontFamily: FontFamily.bold,
      color: C.primary,
    },
    reminderClear: {
      fontSize: 16,
      color: C.muted,
      fontFamily: FontFamily.bold,
      paddingHorizontal: 4,
    },
    addReminderText: {
      color: C.primary,
      fontFamily: FontFamily.bold,
    },
  });
}
