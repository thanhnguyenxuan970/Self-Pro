import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { FontFamily, Radii, Shadows, Spacing, AppColors } from '../config/theme';
import { useNewsFeed } from '../queries/useNews';
import { getNewsViewerKey, isNewsRead } from '../utils/news';

function formatNewsDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function NewsScreen() {
  const { googleUser, colors, t, styles } = useScreenCommons(makeStyles);
  const viewerKey = getNewsViewerKey(googleUser?.sub);
  const {
    news,
    lastSeenNewsId,
    latestNewsId,
    unreadCount,
    isLoading,
    error,
    refetch,
    markAllRead,
  } = useNewsFeed(viewerKey);

  useEffect(() => {
    if (latestNewsId == null || unreadCount === 0 || markAllRead.isPending) return;
    markAllRead.mutate();
  }, [latestNewsId, unreadCount, markAllRead]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{t.newsTitle}</Text>
          <Text style={styles.subtitle}>{t.newsUnreadCount(unreadCount)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.markAllBtn, unreadCount === 0 && styles.markAllBtnDisabled]}
          onPress={() => markAllRead.mutate()}
          disabled={unreadCount === 0 || markAllRead.isPending}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={styles.markAllText}>{t.newsMarkAllRead}</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t.newsLoadFailed}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void refetch()} activeOpacity={0.8}>
            <Text style={styles.retryText}>{t.newsRetry}</Text>
          </TouchableOpacity>
        </View>
      ) : news.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t.newsEmptyTitle}</Text>
          <Text style={styles.stateBody}>{t.newsEmptyBody}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {news.map((item) => {
            const read = isNewsRead(item.id, lastSeenNewsId);
            const tagLabel = item.tag?.trim() || item.version;
            return (
              <View key={item.id} style={[styles.card, !read && styles.cardUnread]}>
                {!read ? <View style={styles.unreadStripe} /> : null}
                <View style={styles.cardBody}>
                  <View style={styles.cardMetaRow}>
                    <View style={styles.versionBadge}>
                      <Text style={styles.versionText}>{item.version}</Text>
                    </View>
                    <View style={styles.tagBadge}>
                      <Text style={styles.tagText}>{tagLabel}</Text>
                    </View>
                  </View>

                  {item.image ? <Image source={{ uri: item.image }} style={styles.cardImage} resizeMode="cover" /> : null}

                  <View style={styles.cardHeaderRow}>
                    <View style={styles.cardCopy}>
                      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                      <Text style={styles.cardDate}>{formatNewsDate(item.published_at, t.timeLocale)}</Text>
                    </View>
                    {read ? <Text style={styles.readBadge}>{t.newsReadBadge}</Text> : null}
                  </View>

                  <Text style={styles.cardBodyText} numberOfLines={3}>{item.body}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgBase },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.sm,
    },
    headerCopy: { flex: 1 },
    title: { fontSize: 28, fontFamily: FontFamily.extraBold, color: C.inkDark, letterSpacing: -0.8 },
    subtitle: { marginTop: 4, fontSize: 13, fontFamily: FontFamily.semiBold, color: C.ink2 },
    markAllBtn: {
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: Radii.pill,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.line,
      justifyContent: 'center',
      ...Shadows.light,
    },
    markAllBtnDisabled: { opacity: 0.45 },
    markAllText: { fontSize: 12, fontFamily: FontFamily.bold, color: C.primaryPress },
    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    stateCard: {
      margin: Spacing.lg,
      padding: Spacing.xl,
      borderRadius: Radii.xl,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.line,
      ...Shadows.light,
    },
    stateTitle: { fontSize: 16, fontFamily: FontFamily.bold, color: C.inkDark },
    stateBody: { marginTop: 6, fontSize: 14, color: C.ink2, lineHeight: 20 },
    retryBtn: {
      alignSelf: 'flex-start',
      marginTop: Spacing.md,
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: Radii.md,
      backgroundColor: C.primary,
      justifyContent: 'center',
    },
    retryText: { fontSize: 13, fontFamily: FontFamily.bold, color: C.white },
    listContent: { padding: Spacing.lg, paddingTop: Spacing.sm, gap: 12 },
    card: {
      flexDirection: 'row',
      borderRadius: Radii.xl,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.line,
      overflow: 'hidden',
      ...Shadows.light,
    },
    cardUnread: { backgroundColor: C.primarySoft + '66', borderColor: C.primary + '33' },
    unreadStripe: { width: 5, backgroundColor: C.primary },
    cardBody: { flex: 1, padding: 16 },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    versionBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radii.pill,
      backgroundColor: C.surface2,
    },
    versionText: { fontSize: 12, fontFamily: FontFamily.bold, color: C.inkDark },
    tagBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radii.pill,
      backgroundColor: C.primarySoft,
    },
    tagText: { fontSize: 12, fontFamily: FontFamily.bold, color: C.inkDark },
    cardImage: {
      width: '100%',
      height: 148,
      borderRadius: Radii.lg,
      marginBottom: 12,
      backgroundColor: C.surface2,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    cardCopy: { flex: 1 },
    cardTitle: { fontSize: 16, fontFamily: FontFamily.extraBold, color: C.inkDark, lineHeight: 22 },
    cardDate: { marginTop: 4, fontSize: 12, fontFamily: FontFamily.medium, color: C.muted },
    readBadge: {
      alignSelf: 'center',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: Radii.pill,
      backgroundColor: C.surface2,
      fontSize: 11,
      fontFamily: FontFamily.bold,
      color: C.muted,
      overflow: 'hidden',
    },
    cardBodyText: { marginTop: 12, fontSize: 14, color: C.ink2, lineHeight: 20 },
  });
}
