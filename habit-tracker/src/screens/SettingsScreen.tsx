import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Switch, TouchableOpacity, Alert, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radii, Spacing, Shadows, Typography } from '../theme';
import { useDarkMode, useLanguage, AppLanguage } from '../hooks/useSettings';
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
    try {
      saveNotifTime();
    } finally {
      submitHandledRef.current = false;
    }
  }

  function handleNotifBlur() {
    if (submitHandledRef.current) return;
    saveNotifTime();
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Xoá tài khoản',
      'Toàn bộ dữ liệu sẽ bị xoá vĩnh viễn và không thể khôi phục. Bạn có chắc không?',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá tài khoản',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await onDeleteAccount(userId);
            } catch {
              Alert.alert('Lỗi', 'Không thể xoá tài khoản. Thử lại sau.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Appearance */}
        <Text style={s.sectionLabel}>GIAO DIỆN</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.rowIc}>🌙</Text>
            <Text style={s.rowLabel}>Chế độ tối</Text>
            <Switch
              value={isDark}
              onValueChange={setIsDark}
              thumbColor={isDark ? Colors.primary : Colors.faint}
              trackColor={{ false: Colors.line2, true: Colors.primarySoft }}
            />
          </View>
        </View>
        <Text style={s.restartNote}>* Áp dụng sau khi khởi động lại ứng dụng</Text>

        {/* Language */}
        <Text style={s.sectionLabel}>NGÔN NGỮ</Text>
        <View style={s.card}>
          {(['vi', 'en'] as AppLanguage[]).map((l, idx) => (
            <TouchableOpacity
              key={l}
              style={[s.row, idx === 1 && s.rowLast]}
              onPress={() => setLanguage(l)}
              activeOpacity={0.7}
            >
              <Text style={s.rowIc}>{l === 'vi' ? '🇻🇳' : '🇬🇧'}</Text>
              <Text style={s.rowLabel}>{l === 'vi' ? 'Tiếng Việt' : 'English'}</Text>
              {lang === l && <Text style={s.check}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.restartNote}>* Tab labels cập nhật sau khi khởi động lại</Text>

        {/* Notification */}
        <Text style={s.sectionLabel}>THÔNG BÁO</Text>
        <View style={s.card}>
          <View style={[s.row, s.rowLast]}>
            <Text style={s.rowIc}>🔔</Text>
            <Text style={s.rowLabel}>Giờ nhắc</Text>
            <TextInput
              style={[s.timeInput, notifError && s.timeInputError]}
              value={notifInput}
              placeholder="HH:MM"
              placeholderTextColor={Colors.faint}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              onFocus={() => setNotifEditing(true)}
              onChangeText={(t) => { setNotifInput(t); setNotifError(false); }}
              onBlur={handleNotifBlur}
              onSubmitEditing={handleNotifSubmit}
              returnKeyType="done"
            />
          </View>
          {notifError && (
            <Text style={s.inputHint}>Định dạng HH:MM (ví dụ: 07:30)</Text>
          )}
        </View>

        {/* Danger zone */}
        <Text style={s.sectionLabel}>TÀI KHOẢN</Text>
        <View style={s.card}>
          <TouchableOpacity
            style={[s.row, s.rowLast, { opacity: deleting ? 0.5 : 1 }]}
            onPress={handleDeleteAccount}
            disabled={deleting}
            activeOpacity={0.7}
          >
            <Text style={s.rowIc}>🗑️</Text>
            <Text style={[s.rowLabel, { color: Colors.danger }]}>Xoá tài khoản</Text>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.hint}>
          Xoá tài khoản sẽ xoá toàn bộ dữ liệu bao gồm lịch sử hoạt động, rank, và phần thưởng. Hành động này không thể hoàn tác.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgBase },
  sectionLabel: {
    ...Typography.sectionLabel,
    color: Colors.muted,
    marginHorizontal: Spacing.lg,
    marginTop: 24,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: 15,
    ...Shadows.light,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: Colors.line,
    gap: 13,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIc: { fontSize: 20, width: 28, textAlign: 'center' },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.inkDark },
  check: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  chevron: { fontSize: 18, color: Colors.faint },
  restartNote: {
    marginHorizontal: Spacing.lg,
    marginTop: 6,
    fontSize: 11,
    color: Colors.muted,
    fontStyle: 'italic',
  },
  hint: {
    marginHorizontal: Spacing.lg,
    marginTop: 12,
    fontSize: 12,
    color: Colors.muted,
    lineHeight: 18,
  },
  timeInput: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.inkDark,
    textAlign: 'right',
    minWidth: 60,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  timeInputError: {
    borderColor: Colors.danger,
    color: Colors.danger,
  },
  inputHint: {
    fontSize: 11,
    color: Colors.danger,
    paddingBottom: 10,
  },
});
