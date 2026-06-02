import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Image,
} from 'react-native';
import { useWeeklySummary, useDailySummary } from '../queries/useToday';
import { useTreatPool } from '../queries/useTreats';
import { useRecentActivityLogs, ActivityLogEntry } from '../queries/useProgress';
import { Radii, Spacing, Shadows, AppColors } from '../theme';
import { useAuthUser } from '../hooks/useAuth';
import { useTheme, useTranslations } from '../hooks/useSettings';

type Props = {
  googleUser: { email: string; name: string; picture: string };
  onSignOut: () => Promise<void>;
};

export function ProfileScreen({ googleUser, onSignOut }: Props) {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const ph = useMemo(() => makePhStyles(colors), [colors]);

  const { data: weekly } = useWeeklySummary(userId);
  const { data: daily } = useDailySummary(userId);
  const { data: treatPool } = useTreatPool(userId);
  const { data: actLogs = [] } = useRecentActivityLogs(userId, 30);

  const weeklyStars = weekly?.weekly_stars ?? 0;
  const streak = daily?.streak_count ?? 0;

  function formatLogDate(entry: ActivityLogEntry): string {
    const d = new Date(entry.logged_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

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
        <Text style={ph.name}>{googleUser.name}</Text>
        <Text style={ph.sub}>{googleUser.email}</Text>
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
          <Text style={ph.lifeV}>★ {treatPool?.treat_stars ?? 0}</Text>
          <Text style={ph.lifeL}>{t.statWeek}</Text>
        </View>
      </View>

      {/* History section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t.historyTitle}</Text>
      </View>

      {actLogs.length === 0 ? (
        <View style={styles.taskCard}>
          <Text style={styles.empty}>{t.noActivity}</Text>
        </View>
      ) : (
        <View style={styles.taskCard}>
          {actLogs.map((item, idx) => (
            <View
              key={item.id}
              style={[styles.row, idx === actLogs.length - 1 && styles.rowLast]}
            >
              <Text style={styles.icon}>{item.stars_delta >= 0 ? '✅' : '❌'}</Text>
              <View style={styles.rowBody}>
                <Text style={styles.taskName} numberOfLines={1}>
                  {item.task_name ?? (item.source === 'BONUS' ? t.bonusSource : item.source)}
                </Text>
                <Text style={styles.taskMeta}>{formatLogDate(item)}</Text>
              </View>
              <Text style={[styles.stars, item.stars_delta < 0 && styles.starsNeg]}>
                {item.stars_delta >= 0 ? '+' : ''}{item.stars_delta.toFixed(1)} ★
              </Text>
            </View>
          ))}
        </View>
      )}

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
    sectionHeader: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
      marginTop: 4,
    },
    sectionTitle: { fontSize: 14, fontWeight: '600', color: C.inkDark },
    taskCard: {
      marginHorizontal: Spacing.lg, backgroundColor: C.surface,
      borderRadius: Radii.md, borderWidth: 1, borderColor: C.line,
      paddingHorizontal: 15, ...Shadows.light,
    },
    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 12, borderBottomWidth: 1, borderColor: C.line,
    },
    rowLast: { borderBottomWidth: 0 },
    icon: { fontSize: 20, marginRight: 12, flexShrink: 0 },
    rowBody: { flex: 1, minWidth: 0 },
    taskName: { fontSize: 14, color: C.inkDark, fontWeight: '600' },
    taskMeta: { fontSize: 11.5, color: C.muted, marginTop: 2 },
    stars: { fontSize: 13, fontWeight: '800', color: C.primary, flexShrink: 0 },
    starsNeg: { color: C.danger },
    empty: { textAlign: 'center', color: C.muted, marginTop: 24, marginBottom: 24, fontSize: 14, paddingHorizontal: 12 },
    logoutBtn: {
      marginHorizontal: Spacing.lg, marginTop: 32, marginBottom: 12,
      paddingVertical: 15, borderRadius: Radii.md,
      borderWidth: 1.5, borderColor: C.danger,
      alignItems: 'center',
    },
    logoutBtnText: { color: C.danger, fontSize: 15, fontWeight: '700' },
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
      shadowColor: '#2E9C6A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 4,
    },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: 32, fontWeight: '800', color: C.primaryPress },
    name: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: C.inkDark, marginTop: 10 },
    sub: { fontSize: 12.5, color: C.muted, marginTop: 3 },
    lifeRow: {
      flexDirection: 'row', marginHorizontal: Spacing.lg, marginTop: 14,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      borderRadius: Radii.md, overflow: 'hidden', ...Shadows.light,
    },
    lifeCell: { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6 },
    lifeDivider: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.line },
    lifeV: { fontSize: 17, fontWeight: '800', color: C.inkDark },
    lifeL: { fontSize: 10, color: C.muted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4 },
  });
}
