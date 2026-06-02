import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, Switch, TouchableOpacity, Alert, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Radii, Spacing, Shadows, Typography, AppColors } from '../theme';
import { useDarkMode, useLanguage, AppLanguage, useTheme, useTranslations } from '../hooks/useSettings';
import { useAuthUser } from '../hooks/useAuth';
import { useNotificationTime, useSetNotificationTime } from '../queries/useSettings';
import { validateNotificationTime } from '../logic/settingsLogic';

type Props = {
  onDeleteAccount: (userId: number) => Promise<void>;
};

export function SettingsScreen({ onDeleteAccount }: Props) {
  const userId = useAuthUser();
  const [isDark, setIsDark] = useDarkMode();
  const [lang, setLanguage] = useLanguage();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [deleting, setDeleting] = useState(false);

  const { data: savedNotifTime } = useNotificationTime(userId);
  const setNotifTimeMutation = useSetNotificationTime(userId);
  const [notifInput, setNotifInput] = useState('');
  const [notifEditing, setNotifEditing] = useState(false);
  const [notifError, setNotifError] = useState(false);
  const submitHandledRef = useRef(false);

  useEffect(() => {
    if (!notifEditing) {
      setNotifInput(savedNotifTime ?? '');
      setNotifError(false);
    }
  }, [savedNotifTime, notifEditing]);

  function saveNotifTime() {
    setNotifEditing(false);
    if (notifInput === '') {
      setNotifError(false);
      setNotifTimeMutation.mutate(null);
    } else if (validateNotificationTime(notifInput)) {
      setNotifError(false);
      setNotifTimeMutation.mutate(notifInput);
    } else {
      setNotifError(true);
      setNotifInput(savedNotifTime ?? '');
    }
  }

  function handleNotifSubmit() {
    submitHandledRef.current = true;
    saveNotifTime();
  }

  function handleNotifBlur() {
    if (submitHandledRef.current) {
      submitHandledRef.current = false;
      return;
    }
    saveNotifTime();
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

        {/* Language */}
        <Text style={styles.sectionLabel}>{t.sectionLanguage}</Text>
        <View style={styles.card}>
          {(['vi', 'en'] as AppLanguage[]).map((l, idx) => (
            <TouchableOpacity
              key={l}
              style={[styles.row, idx === 1 && styles.rowLast]}
              onPress={() => setLanguage(l)}
              activeOpacity={0.7}
            >
              <Text style={styles.rowIc}>{l === 'vi' ? '🇻🇳' : '🇬🇧'}</Text>
              <Text style={styles.rowLabel}>{l === 'vi' ? 'Tiếng Việt' : 'English'}</Text>
              {lang === l && <Text style={styles.check}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* Notification */}
        <Text style={styles.sectionLabel}>{t.sectionNotifications}</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowLast]}>
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
          {notifError && (
            <Text style={styles.inputHint}>{t.timeFormatHint}</Text>
          )}
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
