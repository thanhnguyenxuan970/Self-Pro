import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { queryClient } from './src/queries/queryClient';
import { RootNavigator } from './src/navigation/RootNavigator';
import { getDb } from './src/db/client';
import { getWeekStart } from './src/utils/formatters';
import { shouldShowWeekResetToast } from './src/utils/weekReset';
import { useAuth, resolveUserRow, UserIdContext, GoogleUserContext } from './src/hooks/useAuth';
import { syncToSupabase } from './src/api/syncService';
import { SettingsProvider } from './src/contexts/SettingsContext';
import { useTheme } from './src/hooks/useSettings';
import { LevelUpCelebrationModal } from './src/components/LevelUpCelebrationModal';
import { PENDING_LEVELUP_KEY } from './src/queries/useToday';

function AppInner() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [weekReset, setWeekReset] = useState(false);
  const [celebrationData, setCelebrationData] = useState<{ tierOrder: number; tierName: string } | null>(null);
  const { colors } = useTheme();
  const retryInit = useCallback(() => {
    setDbError(null);
    setDbReady(false);
    setRetryCount(c => c + 1);
  }, []);
  const {
    isLoading: authLoading,
    isOnboarded,
    googleUser,
    userId,
    setResolvedUserId,
    completeOnboarding,
    signInWithGoogle,
    signOut,
    deleteAccount,
  } = useAuth();

  // Wait for auth to finish loading (AsyncStorage is async) so googleUser is
  // available before we resolve the DB row. Without this guard, init() runs
  // with googleUser=null and userId stays 1 for all returning users.
  useEffect(() => {
    if (authLoading) return;
    async function init() {
      const db = await getDb();

      let resolvedUserId = 1;
      if (googleUser?.email) {
        const { id } = await resolveUserRow(db, googleUser.sub ?? googleUser.email, googleUser.email);
        resolvedUserId = id;
        setResolvedUserId(resolvedUserId);
        syncToSupabase(googleUser.sub, googleUser.email).catch(() => {});
      }

      const currentWeekStart = getWeekStart();
      await db.runAsync(
        `UPDATE weekly_summary SET finalized = 1
         WHERE user_id = ? AND finalized = 0 AND week_start < ?`,
        [resolvedUserId, currentWeekStart]
      );

      const user = await db.getFirstAsync<{ last_seen_week_start: string | null }>(
        'SELECT last_seen_week_start FROM users WHERE id = ?',
        [resolvedUserId]
      );
      if (shouldShowWeekResetToast(currentWeekStart, user?.last_seen_week_start ?? null)) {
        setWeekReset(true);
        await db.runAsync(
          'UPDATE users SET last_seen_week_start = ? WHERE id = ?',
          [currentWeekStart, resolvedUserId]
        );
      }

      // Show level-up celebration on first login after rank promotion
      try {
        const raw = await AsyncStorage.getItem(PENDING_LEVELUP_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as { tierOrder: number; tierName: string; weekStart: string };
          setCelebrationData({ tierOrder: stored.tierOrder, tierName: stored.tierName });
          await AsyncStorage.removeItem(PENDING_LEVELUP_KEY);
        }
      } catch {}

      setDbReady(true);
    }
    init().catch(err => {
      console.error('DB init failed:', err);
      setDbError(err instanceof Error ? err.message : String(err));
    });
  // googleUser intentionally captured via closure: init() runs once when auth
  // settles. Fresh sign-ins resolve userId via signInWithGoogle() instead.
  // retryCount bumped by retryInit() to re-trigger this effect after user taps Retry.
  }, [authLoading, retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (dbReady && weekReset) {
      const id = setTimeout(() => {
        Toast.show({
          type: 'success',
          text1: 'Week Reset! 🎉',
          text2: 'New week, fresh stars. Keep grinding!',
          visibilityTime: 4000,
        });
      }, 500);
      return () => clearTimeout(id);
    }
  }, [dbReady, weekReset]);

  if (dbError) {
    return (
      <View style={[appStyles.center, { backgroundColor: colors.bgBase }]}>
        <Text style={[appStyles.errorMsg, { color: colors.ink2 }]}>{'Failed to open database.\nPlease restart or tap Retry.'}</Text>
        <TouchableOpacity style={[appStyles.retryBtn, { backgroundColor: colors.primary }]} onPress={retryInit}>
          <Text style={appStyles.retryTxt}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!dbReady || authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgBase, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <UserIdContext.Provider value={userId}>
    <GoogleUserContext.Provider value={googleUser}>
      <>
        <RootNavigator
          isOnboarded={isOnboarded}
          googleUser={googleUser}
          onCompleteOnboarding={completeOnboarding}
          onSignInWithGoogle={signInWithGoogle}
          onSignOut={signOut}
          onDeleteAccount={deleteAccount}
        />
        <Toast />
        {celebrationData && (
          <LevelUpCelebrationModal
            visible
            tierOrder={celebrationData.tierOrder}
            tierName={celebrationData.tierName}
            onDismiss={() => setCelebrationData(null)}
          />
        )}
      </>
    </GoogleUserContext.Provider>
    </UserIdContext.Provider>
  );
}

const appStyles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorMsg: { fontSize: 15, textAlign: 'center', marginBottom: 20, lineHeight: 22 },
  retryBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 8 },
  retryTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <AppInner />
      </SettingsProvider>
    </QueryClientProvider>
  );
}
