import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { queryClient } from './src/queries/queryClient';
import { RootNavigator } from './src/navigation/RootNavigator';
import { getDb } from './src/db/client';
import { getWeekStart } from './src/logic/formatters';
import { shouldShowWeekResetToast } from './src/logic/weekReset';
import { useAuth, resolveUserRow, UserIdContext } from './src/hooks/useAuth';
import { syncToSupabase } from './src/services/syncService';

function AppInner() {
  const [dbReady, setDbReady] = useState(false);
  const [weekReset, setWeekReset] = useState(false);
  const {
    isLoading: authLoading,
    isOnboarded,
    googleUser,
    userId,
    setResolvedUserId,
    completeOnboarding,
    signInWithGoogle,
    signOut,
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
        resolvedUserId = await resolveUserRow(db, googleUser.email);
        setResolvedUserId(resolvedUserId);
        syncToSupabase(googleUser.email);
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

      try {
        const Notifications = await import('expo-notifications');
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
        await Notifications.requestPermissionsAsync();
      } catch {
        // expo-notifications push APIs unavailable in Expo Go (SDK 53+)
      }
      setDbReady(true);
    }
    init().catch(err => console.error('DB init failed:', err));
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (!dbReady || authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F6F5', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2E9C6A" />
      </View>
    );
  }

  return (
    <UserIdContext.Provider value={userId}>
      <>
        <RootNavigator
          isOnboarded={isOnboarded}
          googleUser={googleUser}
          onCompleteOnboarding={completeOnboarding}
          onSignInWithGoogle={signInWithGoogle}
          onSignOut={signOut}
        />
        <Toast />
      </>
    </UserIdContext.Provider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}
