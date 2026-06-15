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

type ReminderTimeRowProps = {
  value: string;
  error: boolean;
  label: string;
  isLast: boolean;
  onFocus: () => void;
  onChange: (v: string) => void;
  onSave: () => void;
  colors: AppColors;
  styles: ReturnType<typeof makeStyles>;
  hintLabel: string;
};

function ReminderTimeRow({ value, error, label, isLast, onFocus, onChange, onSave, colors, styles, hintLabel }: ReminderTimeRowProps) {
  const submitHandled = useRef(false);
  return (
    <>
      <View style={[styles.row, isLast && !error && styles.rowLast]}>
        <Text style={styles.rowIc}>🔔</Text>
        <Text style={styles.rowLabel}>{label}</Text>
        <TextInput
          style={[styles.timeInput, error && styles.timeInputError]}
          value={value}
          placeholder="HH:MM"
          placeholderTextColor={colors.faint}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          onFocus={onFocus}
          onChangeText={onChange}
          onBlur={() => {
            if (submitHandled.current) { submitHandled.current = false; return; }
            onSave();
          }}
          onSubmitEditing={() => { submitHandled.current = true; onSave(); }}
          returnKeyType="done"
        />
      </View>
      <NotifHint visible={error} label={hintLabel} style={[styles.inputHint, isLast && styles.rowLast]} />
    </>
  );
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

  const [notifInputs, setNotifInputs] = useState(['', '', '']);
  const [notifEditing, setNotifEditing] = useState([false, false, false]);
  const [notifErrors, setNotifErrors] = useState([false, false, false]);

  const savedTimes = [savedNotifTime, savedNotifTime2, savedNotifTime3];
  const notifMutations = [setNotifTimeMutation, setNotifTimeMutation2, setNotifTimeMutation3];

  const [e0, e1, e2] = notifEditing;
  useEffect(() => {
    if (!e0) { setNotifInputs(p => { const n=[...p]; n[0]=savedNotifTime??''; return n; }); setNotifErrors(p => { const n=[...p]; n[0]=false; return n; }); }
  }, [savedNotifTime, e0]);
  useEffect(() => {
    if (!e1) { setNotifInputs(p => { const n=[...p]; n[1]=savedNotifTime2??''; return n; }); setNotifErrors(p => { const n=[...p]; n[1]=false; return n; }); }
  }, [savedNotifTime2, e1]);
  useEffect(() => {
    if (!e2) { setNotifInputs(p => { const n=[...p]; n[2]=savedNotifTime3??''; return n; }); setNotifErrors(p => { const n=[...p]; n[2]=false; return n; }); }
  }, [savedNotifTime3, e2]);

  function handleReminderSave(idx: number) {
    const input = notifInputs[idx];
    setNotifEditing(p => { const n=[...p]; n[idx]=false; return n; });
    const times = notifInputs.map((v, i) => i === idx ? input : v);
    if (input === '') {
      setNotifErrors(p => { const n=[...p]; n[idx]=false; return n; });
      notifMutations[idx].mutate(null);
      scheduleAllHabitReminders(times.map(nullIfEmpty)).catch(() => {});
    } else if (validateNotificationTime(input)) {
      setNotifErrors(p => { const n=[...p]; n[idx]=false; return n; });
      notifMutations[idx].mutate(input);
      scheduleAllHabitReminders(times).catch(() => {});
    } else {
      setNotifErrors(p => { const n=[...p]; n[idx]=true; return n; });
      setNotifInputs(p => { const n=[...p]; n[idx]=savedTimes[idx]??''; return n; });
    }
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
          {([t.reminderLabel, t.reminderLabel2, t.reminderLabel3] as string[]).map((label, idx) => (
            <ReminderTimeRow
              key={idx}
              value={notifInputs[idx]}
              error={notifErrors[idx]}
              label={label}
              isLast={idx === 2}
              onFocus={() => setNotifEditing(p => { const n=[...p]; n[idx]=true; return n; })}
              onChange={(v) => {
                setNotifInputs(p => { const n=[...p]; n[idx]=v; return n; });
                setNotifErrors(p => { const n=[...p]; n[idx]=false; return n; });
              }}
              onSave={() => handleReminderSave(idx)}
              colors={colors}
              styles={styles}
              hintLabel={t.timeFormatHint}
            />
          ))}
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
