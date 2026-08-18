import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppColors, FontFamily, Radii, Shadows, Spacing } from '../config/theme';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { InitialsAvatar } from '../components/friends/InitialsAvatar';
import { ConfirmationSheet } from '../components/friends/ConfirmationSheet';
import { useBlockedAccounts, useUnblockFriend } from '../queries/useFriends';
import { formatRelativeAgo, sanitizeDisplayName } from '../lib/friends';
import type { RemoteBlockedAccountRow } from '../api/friendsApi';
import { useLanguage } from '../hooks/useSettings';

export function BlockedAccountsScreen() {
  const { googleUser, colors, t, styles } = useScreenCommons(makeStyles);
  const [lang] = useLanguage();
  const accountSub = googleUser?.sub ?? 'anon';
  const query = useBlockedAccounts(googleUser?.email ?? null, googleUser?.sub ?? null, true);
  const unblockMutation = useUnblockFriend(googleUser?.email ?? null, accountSub);

  const [target, setTarget] = useState<{ relationshipId: string; displayName: string } | null>(null);

  async function confirmUnblock() {
    if (!target) return;
    const status = await unblockMutation.mutateAsync(target.relationshipId);
    if (status === 'OK') setTarget(null);
  }

  const rows = query.data ?? [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      {query.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : query.error && rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{query.isUnavailable ? t.friendsUnavailableHeadline : t.friendsErrorHeadline}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={row => row.relationship_id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>{t.friendsBlockedEmpty}</Text>}
          renderItem={({ item, index }: { item: RemoteBlockedAccountRow; index: number }) => {
            const name = sanitizeDisplayName(item.display_name) ?? t.leaderboardPlayer;
            return (
              <View style={[styles.row, index === 0 && styles.rowFirst, index === rows.length - 1 && styles.rowLast, index < rows.length - 1 && styles.rowDivider]}>
                <InitialsAvatar name={name} playerId={item.relationship_id} fallbackLabel={t.leaderboardPlayer} colors={colors} />
                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>{name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{t.friendsBlockedAt(formatRelativeAgo(new Date(item.blocked_at).getTime(), lang))}</Text>
                </View>
                <TouchableOpacity
                  style={styles.unblockBtn}
                  onPress={() => setTarget({ relationshipId: item.relationship_id, displayName: name })}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t.friendsUnblockConfirm}
                >
                  <Text style={styles.unblockText}>{t.friendsUnblockConfirm}</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
      <ConfirmationSheet
        visible={target !== null}
        colors={colors}
        tone="primary"
        busy={unblockMutation.isPending}
        title={t.friendsUnblockTitle}
        body={t.friendsUnblockBody}
        confirmLabel={t.friendsUnblockConfirm}
        confirmBusyLabel={t.friendsUnblocking}
        dismissLabel={t.friendsConfirmDismiss}
        onConfirm={() => void confirmUnblock()}
        onDismiss={() => setTarget(null)}
      />
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.bgBase },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorText: { fontSize: 14, color: C.muted, textAlign: 'center', paddingHorizontal: Spacing.lg },
    listContent: { padding: Spacing.lg },
    emptyText: { fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 32 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.surface, borderColor: C.line, borderLeftWidth: 1, borderRightWidth: 1,
      paddingVertical: 12, paddingHorizontal: 14,
    },
    rowFirst: { borderTopWidth: 1, borderTopLeftRadius: Radii.lg, borderTopRightRadius: Radii.lg, ...Shadows.light },
    rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: Radii.lg, borderBottomRightRadius: Radii.lg },
    rowDivider: { borderBottomWidth: 1 },
    info: { flex: 1, minWidth: 0 },
    name: { fontSize: 15, fontFamily: FontFamily.bold, color: C.inkDark },
    meta: { fontSize: 12, color: C.muted, marginTop: 2 },
    unblockBtn: { minHeight: 40, borderRadius: Radii.md, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: C.primarySoft },
    unblockText: { fontSize: 13, fontFamily: FontFamily.bold, color: C.primaryText },
  });
}
