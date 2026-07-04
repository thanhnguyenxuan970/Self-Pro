import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useWeeklySummary, useDailySummary } from '../queries/useToday';
import { useAllTimeStats } from '../queries/useProgress';
import { Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { useAuthUser } from '../hooks/useAuth';
import { useTheme, useTranslations, useAccent } from '../hooks/useSettings';
import { AccentPicker } from '../components/AccentPicker';

type Props = {
  googleUser: { email: string; name: string; picture: string };
  onSignOut: () => Promise<void>;
};

export function ProfileScreen({ googleUser, onSignOut }: Props) {
  const userId = useAuthUser();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const t = useTranslations();
  const [accent, setAccent] = useAccent();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const ph = useMemo(() => makePhStyles(colors), [colors]);

  const { data: weekly } = useWeeklySummary(userId);
  const { data: daily } = useDailySummary(userId);
  const { data: allTime } = useAllTimeStats(userId);

  const weeklyStars = weekly ? weekly.weekly_stars : 0;
  const streak = daily ? daily.streak_count : 0;
  const totalStars = allTime ? allTime.totalStars : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Centered profile header */}
      <View style={ph.head}>
        {googleUser.picture ? (
          <Image source={{ uri: googleUser.picture }} style={ph.avatar} />
        ) : (
          <View style={[ph.avatar, ph.avatarFallback]}>
            <Text style={ph.avatarInitial}>{(googleUser.name.charAt(0) || '?').toUpperCase()}</Text>
          </View>
        )}
        <Text style={ph.name} numberOfLines={1}>{googleUser.name}</Text>
        <Text style={ph.sub} numberOfLines={1}>{googleUser.email}</Text>
      </View>

      {/* Life stats row */}
      <View style={ph.lifeRow}>
        <View style={ph.lifeCell}>
          <Text style={ph.lifeV}>{weeklyStars} ★</Text>
          <Text style={ph.lifeL}>{t.statRank}</Text>
        </View>
        <View style={[ph.lifeCell, ph.lifeDivider]}>
          <Text style={ph.lifeV}>{streak} 🔥</Text>
          <Text style={ph.lifeL}>{t.statStreak}</Text>
        </View>
        <View style={ph.lifeCell}>
          <Text style={ph.lifeV}>{totalStars} ★</Text>
          <Text style={ph.lifeL}>{t.statTotalStars}</Text>
        </View>
      </View>

      {/* Trophy shelf entry */}
      <TouchableOpacity
        style={ph.trophyRow}
        onPress={() => (navigation as any).navigate('TrophyShelf')}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={t.screenTrophyShelf}
      >
        <Text style={ph.trophyIcon}>🏆</Text>
        <Text style={ph.trophyLabel}>{t.screenTrophyShelf}</Text>
        <Text style={ph.trophyChevron}>›</Text>
      </TouchableOpacity>

      {/* Accent color picker */}
      <View style={styles.accentCard}>
        <Text style={styles.accentLabel}>{t.accentColorLabel}</Text>
        <AccentPicker accent={accent} onSelect={setAccent} colors={colors} />
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={onSignOut} activeOpacity={0.8}>
        <Text style={styles.logoutBtnText}>{t.signOut}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bgBase },
    accentCard: {
      marginHorizontal: Spacing.lg, marginTop: 14,
      backgroundColor: C.surface, borderRadius: Radii.md,
      borderWidth: 1, borderColor: C.line,
      paddingHorizontal: 15, paddingTop: 14, paddingBottom: 4,
      ...Shadows.light,
    },
    accentLabel: { fontSize: 14, fontFamily: FontFamily.semiBold, color: C.inkDark },
    logoutBtn: {
      marginHorizontal: Spacing.lg, marginTop: 32, marginBottom: 12,
      paddingVertical: 15, borderRadius: Radii.md,
      borderWidth: 1.5, borderColor: C.danger,
      alignItems: 'center',
    },
    logoutBtnText: { color: C.danger, fontSize: 15, fontFamily: FontFamily.bold },
  });
}

function makePhStyles(C: AppColors) {
  return StyleSheet.create({
    head: {
      paddingVertical: 14, paddingHorizontal: Spacing.lg,
      alignItems: 'center',
    },
    avatar: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: C.primarySoft,
      borderWidth: 1, borderColor: C.line,
      marginBottom: 0,
      shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 4,
    },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: 32, fontFamily: FontFamily.extraBold, color: C.primaryPress },
    name: { fontSize: 20, fontFamily: FontFamily.extraBold, letterSpacing: -0.3, color: C.inkDark, marginTop: 10 },
    sub: { fontSize: 12.5, color: C.ink2, marginTop: 3 },
    lifeRow: {
      flexDirection: 'row', marginHorizontal: Spacing.lg, marginTop: 14,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      borderRadius: Radii.md, overflow: 'hidden', ...Shadows.light,
    },
    lifeCell: { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6 },
    lifeDivider: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.line },
    lifeV: { fontSize: 17, fontFamily: FontFamily.extraBold, color: C.inkDark },
    lifeL: { fontSize: 12, color: C.ink2, fontFamily: FontFamily.semiBold, marginTop: 3 },
    trophyRow: {
      flexDirection: 'row', alignItems: 'center',
      marginHorizontal: Spacing.lg, marginTop: 14,
      backgroundColor: C.surface, borderRadius: Radii.md,
      borderWidth: 1, borderColor: C.line,
      paddingHorizontal: 15, paddingVertical: 14,
      ...Shadows.light,
    },
    trophyIcon: { fontSize: 20, marginRight: 10 },
    trophyLabel: { flex: 1, fontSize: 15, fontFamily: FontFamily.semiBold, color: C.inkDark },
    trophyChevron: { fontSize: 20, color: C.faint, fontFamily: FontFamily.bold },
  });
}
