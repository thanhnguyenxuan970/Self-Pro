import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import * as Notifications from 'expo-notifications';
import { queryClient } from './src/queries/queryClient';
import { RootNavigator } from './src/navigation/RootNavigator';
import { getDb } from './src/db/client';
import { getWeekStart } from './src/logic/formatters';
import { shouldShowWeekResetToast } from './src/logic/weekReset';
import { useAuth } from './src/hooks/useAuth';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function AppInner() {
  const [dbReady, setDbReady] = useState(false);
  const [weekReset, setWeekReset] = useState(false);
  const { isLoading: authLoading, isOnboarded, googleUser, completeOnboarding, signInWithGoogle, signOut } = useAuth();

  useEffect(() => {
    async function init() {
      const db = await getDb();
      const currentWeekStart = getWeekStart();

      await db.runAsync(
        `UPDATE weekly_summary SET finalized = 1
         WHERE user_id = 1 AND finalized = 0 AND week_start < ?`,
        [currentWeekStart]
      );

      const user = await db.getFirstAsync<{ last_seen_week_start: string | null }>(
        'SELECT last_seen_week_start FROM users WHERE id = 1'
      );
      if (shouldShowWeekResetToast(currentWeekStart, user?.last_seen_week_start ?? null)) {
        setWeekReset(true);
        await db.runAsync(
          'UPDATE users SET last_seen_week_start = ? WHERE id = 1',
          [currentWeekStart]
        );
      }

      await Notifications.requestPermissionsAsync();

      setDbReady(true);
    }
    init().catch(err => console.error('DB init failed:', err));
  }, []);

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
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}
