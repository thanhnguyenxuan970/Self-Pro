import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Network from 'expo-network';
import { useGoogleUser } from '../hooks/authContext';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { FontFamily, Radii, Shadows, Spacing } from '../config/theme';
import {
  getSyncStatus,
  hydrateSyncRetryState,
  requestCurrentUserSync,
  retryPendingSyncWhenOnline,
  subscribeSyncStatus,
} from '../api/syncRetry';

/**
 * The app writes activity to SQLite before starting cloud sync. This banner
 * makes that distinction visible whenever the later upload has not completed.
 */
export function SyncStatusBanner() {
  const { colors } = useTheme();
  const t = useTranslations();
  const googleUser = useGoogleUser();
  const network = Network.useNetworkState();
  const syncStatus = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
  const retriedForConnection = useRef(false);
  const isOnline = network.isConnected === true && network.isInternetReachable !== false;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    void hydrateSyncRetryState();
  }, [googleUser?.sub]);

  useEffect(() => {
    if (!isOnline) {
      retriedForConnection.current = false;
      return;
    }
    if (syncStatus === 'idle') {
      retriedForConnection.current = false;
      return;
    }
    if (syncStatus !== 'pending' || retriedForConnection.current) return;

    // Retry once when an existing pending write is discovered at startup or
    // connectivity returns. A persistent API failure remains visibly pending
    // instead of becoming a foreground retry loop.
    retriedForConnection.current = true;
    void retryPendingSyncWhenOnline(true);
  }, [isOnline, syncStatus]);

  if (syncStatus !== 'pending') return null;

  const actionLabel = isOnline ? t.syncRetry : t.syncWaitingForConnection;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.banner} accessibilityLiveRegion="polite">
        <Text style={styles.copy} numberOfLines={2}>{t.syncPending}</Text>
        <TouchableOpacity
          style={[styles.action, !isOnline && styles.actionDisabled]}
          onPress={() => { if (isOnline) void requestCurrentUserSync(); }}
          disabled={!isOnline}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityState={{ disabled: !isOnline }}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    wrap: { position: 'absolute', left: Spacing.md, right: Spacing.md, bottom: 96, zIndex: 20 },
    banner: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      padding: Spacing.sm,
      paddingLeft: Spacing.md,
      backgroundColor: C.surface,
      borderColor: C.primaryLine,
      borderWidth: 1,
      borderRadius: Radii.lg,
      ...Shadows.medium,
    },
    copy: { flex: 1, color: C.inkDark, fontFamily: FontFamily.medium, fontSize: 13, lineHeight: 18 },
    action: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: Spacing.md,
      backgroundColor: C.primarySoft,
      borderRadius: Radii.pill,
    },
    actionDisabled: { backgroundColor: C.surface2 },
    actionText: { color: C.primaryText, fontFamily: FontFamily.bold, fontSize: 13 },
  });
}
