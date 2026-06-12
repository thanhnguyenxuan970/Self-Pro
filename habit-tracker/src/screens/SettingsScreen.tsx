import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, Switch, TouchableOpacity, Alert, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Radii, Spacing, Shadows, Typography, AppColors } from '../config/theme';
import { useDarkMode, useLanguage, useAudioEnabled, AppLanguage, useTheme, useTranslations } from '../hooks/useSettings';
import { useAuthUser } from '../hooks/useAuth';
import {
  useNotificationTime, useSetNotificationTime,
  useNotificationTime2, useSetNotificationTime2,
  useNotificationTime3, useSetNotificationTime3,
} from '../queries/useSettings';
import { validateNotificationTime } from '../utils/settingsLogic';
import { scheduleAllHabitReminders } from '../utils/notifications';
import { FeedbackSheet } from './FeedbackSheet';

type Props = {
  onDeleteAccount: (userId: number) => Promise<void>;
  onResetProgress: (userId: number) => Promise<void>;
};

function nullIfEmpty(s: string): string | null {
  return s || null;
}

function NotifHint({ visible, label, style }: { visible: boolean; label: string; style: object }) {
  return visible ? <Text style={style}>{label}</Text> : null;
}

function LanguageOption({ lang, l, isLast, onPress, styles }: { lang: string; l: AppLanguage; isLast: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return (
    <TouchableOpacity
      style={[styles.row, isLast && styles.rowLast]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.rowIc}>{l === 'vi' ? '🇻🇳' : '🇬🇧'}</Text>
      <Text style={styles.rowLabel}>{l === 'vi' ? 'Tiếng Việt' : 'English'}</Text>
      {lang === l && <Text style={styles.check}>✓</Text>}
    </TouchableOpacity>
  );
}

export function SettingsScreen({ onDeleteAccount, onResetProgress }: Props) {
  const userId = useAuthUser();
  const [isDark, setIsDark] = useDarkMode();
  const [lang, setLanguage] = useLanguage();
  const [audioEnabled, setAudioEnabled] = useAudioEnabled();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);

  const { data: savedNotifTime } = useNotificationTime(userId);
  const setNotifTimeMutation = useSetNotificationTime(userId);
  const { data: savedNotifTime2 } = useNotificationTime2(userId);
  const setNotifTimeMutation2 = useSetNotificationTime2(userId);
  const { data: savedNotifTime3 } = useNotificationTime3(userId);
  const setNotifTimeMutation3 = useSetNotificationTime3(userId);

  const [notifInput, setNotifInput] = useState('');
  const [notifEditing, setNotifEditing] = useState(false);
  const [notifError, setNotifError] = useState(false);
  const submitHandledRef = useRef(false);

  const [notifInput2, setNotifInput2] = useState('');
  const [notifEditing2, setNotifEditing2] = useState(false);
  const [notifError2, setNotifError2] = useState(false);
  const submitHandledRef2 = useRef(false);

  const [notifInput3, setNotifInput3] = useState('');
  const [notifEditing3, setNotifEditing3] = useState(false);
  const [notifError3, setNotifError3] = useState(false);
  const submitHandledRef3 = useRef(false);

  useEffect(() => {
    if (!notifEditing) { setNotifInput(savedNotifTime ?? ''); setNotifError(false); }
  }, [savedNotifTime, notifEditing]);

  useEffect(() => {
    if (!notifEditing2) { setNotifInput2(savedNotifTime2 ?? ''); setNotifError2(false); }
  }, [savedNotifTime2, notifEditing2]);

  useEffect(() => {
    if (!notifEditing3) { setNotifInput3(savedNotifTime3 ?? ''); setNotifError3(false); }
  }, [savedNotifTime3, notifEditing3]);

  function makeNotifSaver(
    input: string,
    savedTime: string | null | undefined,
    setEditing: (v: boolean) => void,
    setError: (v: boolean) => void,
    setInput: (v: string) => void,
    mutate: (t: string | null) => void,
    slotIndex: number,
  ) {
    return () => {
      setEditing(false);
      const t1 = slotIndex === 0 ? input : notifInput;
      const t2 = slotIndex === 1 ? input : notifInput2;
      const t3 = slotIndex === 2 ? input : notifInput3;
      if (input === '') {
        setError(false);
        mutate(null);
        scheduleAllHabitReminders([nullIfEmpty(t1), nullIfEmpty(t2), nullIfEmpty(t3)]).catch(() => {});
      } else if (validateNotificationTime(input)) {
        setError(false);
        mutate(input);
        scheduleAllHabitReminders([t1, t2, t3]).catch(() => {});
      } else {
        setError(true);
        setInput(savedTime ?? '');
      }
    };
  }

  const saveNotifTime = makeNotifSaver(notifInput, savedNotifTime, setNotifEditing, setNotifError, setNotifInput, (t) => setNotifTimeMutation.mutate(t), 0);
  const saveNotifTime2 = makeNotifSaver(notifInput2, savedNotifTime2, setNotifEditing2, setNotifError2, setNotifInput2, (t) => setNotifTimeMutation2.mutate(t), 1);
  const saveNotifTime3 = makeNotifSaver(notifInput3, savedNotifTime3, setNotifEditing3, setNotifError3, setNotifInput3, (t) => setNotifTimeMutation3.mutate(t), 2);

  function handleNotifSubmit() { submitHandledRef.current = true; saveNotifTime(); }
  function handleNotifBlur() {
    if (submitHandledRef.current) { submitHandledRef.current = false; return; }
    saveNotifTime();
  }
  function handleNotifSubmit2() { submitHandledRef2.current = true; saveNotifTime2(); }
  function handleNotifBlur2() {
    if (submitHandledRef2.current) { submitHandledRef2.current = false; return; }
    saveNotifTime2();
  }
  function handleNotifSubmit3() { submitHandledRef3.current = true; saveNotifTime3(); }
  function handleNotifBlur3() {
    if (submitHandledRef3.current) { submitHandledRef3.current = false; return; }
    saveNotifTime3();
  }

  function handleResetProgress() {
    Alert.alert(
      t.resetProgressTitle,
      t.resetProgressMsg,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.resetProgressBtn,
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              await onResetProgress(userId);
              Alert.alert('', t.resetProgressSuccess);
            } catch {
              Alert.alert(t.error, t.resetProgressError);
            } finally {
              setResetting(false);
            }
          },
        },
      ],
    );
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
            />
          </View>
        </View>

        {/* Language */}
        <Text style={styles.sectionLabel}>{t.sectionLanguage}</Text>
        <View style={styles.card}>
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
          <View style={styles.row}>
            <Text style={styles.rowIc}>🔔</Text>
            <Text style={styles.rowLabel}>{t.reminderLabel}</Text>
            <TextInput
              style={[styles.timeInput, notifError && styles.timeInputError]}
              value={notifInput}
              placeholder="HH:MM"
              placeholderTextColor={colors.faint}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              onFocus={() => setNotifEditing(true)}
              onChangeText={(tx) => { setNotifInput(tx); setNotifError(false); }}
              onBlur={handleNotifBlur}
              onSubmitEditing={handleNotifSubmit}
              returnKeyType="done"
            />
          </View>
          <NotifHint visible={notifError} label={t.timeFormatHint} style={styles.inputHint} />
          <View style={styles.row}>
            <Text style={styles.rowIc}>🔔</Text>
            <Text style={styles.rowLabel}>{t.reminderLabel2}</Text>
            <TextInput
              style={[styles.timeInput, notifError2 && styles.timeInputError]}
              value={notifInput2}
              placeholder="HH:MM"
              placeholderTextColor={colors.faint}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              onFocus={() => setNotifEditing2(true)}
              onChangeText={(tx) => { setNotifInput2(tx); setNotifError2(false); }}
              onBlur={handleNotifBlur2}
              onSubmitEditing={handleNotifSubmit2}
              returnKeyType="done"
            />
          </View>
          <NotifHint visible={notifError2} label={t.timeFormatHint} style={styles.inputHint} />
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.rowIc}>🔔</Text>
            <Text style={styles.rowLabel}>{t.reminderLabel3}</Text>
            <TextInput
              style={[styles.timeInput, notifError3 && styles.timeInputError]}
              value={notifInput3}
              placeholder="HH:MM"
              placeholderTextColor={colors.faint}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              onFocus={() => setNotifEditing3(true)}
              onChangeText={(tx) => { setNotifInput3(tx); setNotifError3(false); }}
              onBlur={handleNotifBlur3}
              onSubmitEditing={handleNotifSubmit3}
              returnKeyType="done"
            />
          </View>
          <NotifHint visible={notifError3} label={t.timeFormatHint} style={styles.inputHint} />
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
            style={[styles.row, { opacity: resetting ? 0.5 : 1 }]}
            onPress={handleResetProgress}
            disabled={resetting}
            activeOpacity={0.7}
          >
            <Text style={styles.rowIc}>🔄</Text>
            <Text style={[styles.rowLabel, { color: colors.danger }]}>{t.resetProgressLabel}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
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
      color: C.muted,
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
    rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: C.inkDark },
    check: { fontSize: 16, fontWeight: '800', color: C.primary },
    chevron: { fontSize: 18, color: C.faint },
    hint: {
      marginHorizontal: Spacing.lg,
      marginTop: 12,
      fontSize: 12,
      color: C.muted,
      lineHeight: 18,
    },
    timeInput: {
      fontSize: 15,
      fontWeight: '600',
      color: C.inkDark,
      textAlign: 'right',
      minWidth: 60,
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: C.line,
    },
    timeInputError: {
      borderColor: C.danger,
      color: C.danger,
    },
    inputHint: {
      fontSize: 11,
      color: C.danger,
      paddingBottom: 10,
    },
  });
}
