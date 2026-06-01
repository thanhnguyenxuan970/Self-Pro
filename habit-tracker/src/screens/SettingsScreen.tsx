import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radii, Spacing, Shadows, Typography } from '../theme';
import { useDarkMode, useLanguage, AppLanguage } from '../hooks/useSettings';
import { useAuthUser } from '../hooks/useAuth';

type Props = {
  onDeleteAccount: (userId: number) => Promise<void>;
};

export function SettingsScreen({ onDeleteAccount }: Props) {
  const userId = useAuthUser();
  const [isDark, setIsDark] = useDarkMode();
  const [lang, setLanguage] = useLanguage();
  const [deleting, setDeleting] = useState(false);

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
  hint: {
    marginHorizontal: Spacing.lg,
    marginTop: 12,
    fontSize: 12,
    color: Colors.muted,
    lineHeight: 18,
  },
});
