import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useLanguage } from '../hooks/useSettings';
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
  const [language] = useLanguage();
  const [expandedNewsId, setExpandedNewsId] = useState<number | null>(null);
  const viewerKey = getNewsViewerKey(googleUser?.sub);
  const {
    news,
    lastSeenNewsId,
    unreadCount,
    isLoading,
    error,
    refetch,
    markAllRead,
  } = useNewsFeed(viewerKey);

  const renderItem = useCallback(({ item }: { item: (typeof news)[number] }) => {
    const read = isNewsRead(item.id, lastSeenNewsId);
    const title = language === 'en' ? item.title_en ?? item.title : item.title;
    const body = language === 'en' ? item.body_en ?? item.body : item.body;
    const tagLabel = (language === 'en' ? item.tag_en : item.tag)?.trim() || item.version;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          setExpandedNewsId((id) => id === item.id ? null : item.id);
          if (!read) markAllRead.mutate();
        }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ expanded: expandedNewsId === item.id }}
        accessibilityLabel={read ? title : `${t.newsUnreadBadge}. ${title}`}
      >
        <View style={styles.cardMetaRow}>
          {item.version ? <View style={styles.versionBadge}>
            <Text style={styles.versionText} numberOfLines={1}>{item.version}</Text>
          </View> : null}
          <View style={styles.tagBadge}>
            <Text style={styles.tagText} numberOfLines={1}>{tagLabel}</Text>
          </View>
        </View>

        {item.image ? <Image source={{ uri: item.image }} style={styles.cardImage} resizeMode="cover" resizeMethod="resize" /> : null}

        <View style={styles.cardHeaderRow}>
          <View style={styles.cardCopy}>
            <View style={styles.cardTitleRow}>
              {!read ? <View style={styles.cardUnreadDot} /> : null}
              <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
            </View>
            <Text style={styles.cardDate}>{formatNewsDate(item.published_at, t.timeLocale)}</Text>
          </View>
          {read ? <Text style={styles.readBadge}>{t.newsReadBadge}</Text> : null}
        </View>

        <Text style={styles.cardBodyText} numberOfLines={expandedNewsId === item.id ? undefined : 3}>{body}</Text>
      </TouchableOpacity>
    );
  }, [expandedNewsId, language, lastSeenNewsId, markAllRead, styles, t]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.subtitle}>{t.newsUnreadCount(unreadCount)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.markAllBtn, unreadCount === 0 && styles.markAllBtnDisabled]}
          onPress={() => markAllRead.mutate()}
          disabled={unreadCount === 0 || markAllRead.isPending}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ disabled: unreadCount === 0 || markAllRead.isPending }}
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
          <TouchableOpacity style={styles.retryBtn} onPress={() => void refetch()} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.newsRetry}>
            <Text style={styles.retryText}>{t.newsRetry}</Text>
          </TouchableOpacity>
        </View>
      ) : news.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t.newsEmptyTitle}</Text>
          <Text style={styles.stateBody}>{t.newsEmptyBody}</Text>
        </View>
      ) : (
        <FlatList
          data={news}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
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
    subtitle: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.ink2 },
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
    retryText: { fontSize: 13, fontFamily: FontFamily.bold, color: C.onAccent },
    listContent: { padding: Spacing.lg, paddingTop: Spacing.sm, gap: 12 },
    card: {
      borderRadius: Radii.xl,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.line,
      overflow: 'hidden',
      padding: 16,
      ...Shadows.light,
    },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    versionBadge: {
      flexShrink: 1,
      maxWidth: '100%',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radii.pill,
      backgroundColor: C.surface2,
    },
    versionText: { fontSize: 12, fontFamily: FontFamily.bold, color: C.inkDark },
    tagBadge: {
      flexShrink: 1,
      maxWidth: '100%',
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
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardUnreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger },
    cardTitle: { flexShrink: 1, fontSize: 16, fontFamily: FontFamily.extraBold, color: C.inkDark, lineHeight: 22 },
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
