import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as Sentry from '@sentry/react-native';
import {
  useFonts,
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  BeVietnamPro_800ExtraBold,
} from '@expo-google-fonts/be-vietnam-pro';
import { ActivityIndicator, AppState, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from './src/queries/queryClient';
import { RootNavigator } from './src/navigation/RootNavigator';
import { getDb } from './src/db/client';
import { useAuth, resolveUserRow, UserIdContext, GoogleUserContext } from './src/hooks/useAuth';
import { syncToSupabase } from './src/api/syncService';
import { SettingsProvider } from './src/contexts/SettingsContext';
import { useTheme, useLanguage } from './src/hooks/useSettings';
import { FontFamily } from './src/config/theme';
import { createToastConfig } from './src/config/toastConfig';
import { TutorialProvider } from './src/hooks/useTutorial';
import { rolloverChallenge, syncActiveChallengeReminders } from './src/queries/useChallenge';
import { activateChallengeReminderSync, scheduleAllHabitReminders } from './src/utils/notifications';

// Crash reporting: hard no-op until EXPO_PUBLIC_SENTRY_DSN is supplied (no
// Sentry account/project exists yet -- see TODOS.md). Guarded in try/catch
// because a monitoring feature must never be able to crash the thing it's
// monitoring (matches this repo's established pattern of guarding
// non-critical side-effect calls, e.g. notification scheduling below).
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      beforeSend: (event) => {
        if (event.user) {
          delete event.user.email;
          delete (event.user as Record<string, unknown>).google_sub;
        }
        return event;
      },
      // Sentry's default http/fetch breadcrumbs capture the full request URL.
      // Supabase REST calls filter by email in the query string (e.g.
      // deleteUserFromSupabase's `?user_email=eq.<email>`), which would ship
      // a user's plaintext email to Sentry as a breadcrumb attached to
      // whatever error fires next in the session -- strip query strings
      // before they're recorded, regardless of which endpoint set them.
      beforeBreadcrumb: (breadcrumb) => {
        const url = breadcrumb.data?.url;
        if (typeof url === 'string' && url.includes('?')) {
          breadcrumb.data!.url = url.split('?')[0];
        }
        return breadcrumb;
      },
    });
  } catch (e) {
    console.warn('[Sentry] init failed, crash reporting inactive this session:', e);
  }
}

function msUntilLocalMidnight(now = Date.now()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - now);
}

function AppInner() {
  const [fontsLoaded] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    BeVietnamPro_800ExtraBold,
  });
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const { colors } = useTheme();
  const [lang] = useLanguage();
  const toastConfig = useMemo(() => createToastConfig(colors), [colors]);
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
        syncToSupabase(googleUser.sub, googleUser.email)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['rank'] });
            queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
          })
          .catch((error) => {
            console.warn('[sync] activity log sync failed:', error);
          });
      }

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
    if (!dbReady || !isOnboarded || !googleUser?.email) return;
    activateChallengeReminderSync();
    let disposed = false;
    let inFlight: Promise<void> | null = null;
    const run = (): Promise<void> => {
      if (disposed) return Promise.resolve();
      if (inFlight) return inFlight;
      inFlight = rolloverChallenge(userId)
      // Android clears AlarmManager-backed Expo notifications on force-stop,
      // but Expo may retain the request records. Re-arm the deterministic
      // Challenge slots whenever the app cold-starts or returns foreground.
      .then(async () => {
        if (disposed) return;
        await syncActiveChallengeReminders(userId, lang, {
          forceReschedule: true,
          isActive: () => !disposed,
        });
      })
      .then(() => {
        if (!disposed) queryClient.invalidateQueries({ queryKey: ['challenge'] });
      })
      .catch(() => {})
      .finally(() => { inFlight = null; });
      return inFlight;
    };
    run();
    let dailyTimer: ReturnType<typeof setInterval> | undefined;
    const midnightTimer = setTimeout(() => {
      run();
      dailyTimer = setInterval(run, 24 * 60 * 60 * 1000);
    }, msUntilLocalMidnight());
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') run();
    });
    return () => {
      disposed = true;
      clearTimeout(midnightTimer);
      if (dailyTimer) clearInterval(dailyTimer);
      appStateSubscription.remove();
    };
  }, [dbReady, isOnboarded, userId, lang, googleUser?.email]);

  // Android clears AlarmManager-backed local notifications on events the app
  // never hears about (force-stop, OS "unused apps" auto-restriction, an
  // update/reinstall) -- scheduleAllHabitReminders is otherwise only called
  // from Settings, so a wiped schedule stayed wiped forever with the saved
  // time still showing in Settings. Re-arm from the DB on cold start and
  // every foreground so the OS schedule can't silently drift from it.
  useEffect(() => {
    if (!dbReady || !isOnboarded || !googleUser?.email) return;
    let disposed = false;
    let inFlight: Promise<void> | null = null;
    const run = () => {
      if (disposed || inFlight) return;
      inFlight = getDb()
        .then(db => {
          if (disposed) return null;
          return db.getFirstAsync<{ notification_time: string | null; notification_time_2: string | null; notification_time_3: string | null }>(
            'SELECT notification_time, notification_time_2, notification_time_3 FROM users WHERE id = ?',
            [userId],
          );
        })
        .then(async row => {
          if (disposed || !row) return;
          await scheduleAllHabitReminders(
            [row.notification_time ?? null, row.notification_time_2 ?? null, row.notification_time_3 ?? null],
            lang,
            { requestPermission: false, isActive: () => !disposed },
          );
        })
        .catch(error => console.warn('[notifications] reminder rehydration failed:', error))
        .finally(() => { inFlight = null; });
    };
    run();
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') run();
    });
    return () => {
      disposed = true;
      appStateSubscription.remove();
    };
  }, [dbReady, isOnboarded, userId, lang, googleUser?.email]);

  if (dbError) {
    return (
      <View style={[appStyles.center, { backgroundColor: colors.bgBase }]}>
        <Text style={[appStyles.errorMsg, { color: colors.ink2 }]}>{'Failed to open database.\nPlease restart or tap Retry.'}</Text>
        <TouchableOpacity
          style={[appStyles.retryBtn, { backgroundColor: colors.primary }]}
          onPress={retryInit}
          accessibilityRole="button"
          accessibilityLabel="Retry"
        >
          <Text style={[appStyles.retryTxt, { color: colors.onAccent }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!dbReady || authLoading || !fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgBase, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <UserIdContext.Provider value={userId}>
    <GoogleUserContext.Provider value={googleUser}>
      <TutorialProvider>
        <RootNavigator
          isOnboarded={isOnboarded}
          googleUser={googleUser}
          onCompleteOnboarding={completeOnboarding}
          onSignInWithGoogle={signInWithGoogle}
          onSignOut={signOut}
          onDeleteAccount={deleteAccount}
        />
        <Toast config={toastConfig} />
      </TutorialProvider>
    </GoogleUserContext.Provider>
    </UserIdContext.Provider>
  );
}

const appStyles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorMsg: { fontSize: 15, textAlign: 'center', marginBottom: 20, lineHeight: 22 },
  retryBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 },
  retryTxt: { fontSize: 15, fontFamily: FontFamily.semiBold },
});

function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <AppInner />
        </SettingsProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export default SENTRY_DSN ? Sentry.wrap(App) : App;
