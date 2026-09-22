import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { restoreUserDataIfNeeded } from './src/api/syncService';
import { SettingsProvider } from './src/contexts/SettingsContext';
import { useTheme, useLanguage, useTranslations } from './src/hooks/useSettings';
import { FontFamily } from './src/config/theme';
import { createToastConfig } from './src/config/toastConfig';
import { TutorialProvider } from './src/hooks/useTutorial';
import { rolloverChallenge, syncActiveChallengeReminders } from './src/queries/useChallenge';
import { activateChallengeReminderSync, scheduleAllHabitReminders } from './src/utils/notifications';
import { createQaSandboxUser, isQaSandboxBuildAvailable, isQaSandboxIdentity, purgeQaSandbox, resetQaSandbox, seedQaSandbox } from './src/qa/qaSandbox';
import { normalizeAccountEmail } from './src/lib/accountIdentity';
import { AuthRecoveryScreen } from './src/components/AuthRecoveryScreen';
import { SyncStatusBanner } from './src/components/SyncStatusBanner';
import { requestCurrentUserSync } from './src/api/syncRetry';

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
  const [accountRecoveryError, setAccountRecoveryError] = useState(false);
  const [recoveryRetryPending, setRecoveryRetryPending] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const recoveryRetryRequested = useRef<{ email: string; sub?: string } | null>(null);
  const recoveryRetryInFlight = useRef<{ email: string; sub?: string } | null>(null);
  const qaSeedInFlight = useRef(false);
  const qaSeededForSub = useRef<string | null>(null);
  const { colors } = useTheme();
  const t = useTranslations();
  const [lang] = useLanguage();
  const toastConfig = useMemo(() => createToastConfig(colors), [colors]);
  const retryInit = useCallback(() => {
    setDbError(null);
    setAccountRecoveryError(false);
    setDbReady(false);
    setRetryCount(c => c + 1);
  }, []);
  const {
    isLoading: authLoading,
    startupRecoveryState,
    retryStartupRecovery,
    isOnboarded,
    googleUser,
    userId,
    setResolvedUserId,
    completeOnboarding,
    signInWithGoogle,
    signOut,
    deleteAccount,
    completePendingReset,
    completePendingDelete,
  } = useAuth();
  const googleUserRef = useRef(googleUser);
  googleUserRef.current = googleUser;

  const handleQaSandboxReset = useCallback(async () => {
    const qaUser = googleUser;
    if (!qaUser || !isQaSandboxBuildAvailable() || !isQaSandboxIdentity(qaUser)) {
      throw new Error('QA sandbox reset is unavailable for this account');
    }
    qaSeedInFlight.current = true;
    try {
      const db = await getDb();
      const resolvedQaUserId = await resetQaSandbox(db);
      qaSeededForSub.current = qaUser.sub;
      queryClient.clear();
      setResolvedUserId(resolvedQaUserId);
    } finally {
      qaSeedInFlight.current = false;
    }
  }, [googleUser, setResolvedUserId]);

  const handleAccountRecoveryRetry = useCallback(() => {
    if (startupRecoveryState === 'retryable') {
      retryStartupRecovery();
      return;
    }
    if (!googleUser?.email) {
      retryInit();
      return;
    }
    if (recoveryRetryInFlight.current) return;
    const request = { email: googleUser.email, sub: googleUser.sub };
    recoveryRetryInFlight.current = request;
    recoveryRetryRequested.current = request;
    setRecoveryRetryPending(true);
    retryInit();
  }, [googleUser?.email, googleUser?.sub, retryInit, retryStartupRecovery, startupRecoveryState]);

  // Wait for auth to finish loading (AsyncStorage is async) so googleUser is
  // available before we resolve the DB row. Without this guard, init() runs
  // with googleUser=null and userId stays 1 for all returning users.
  useEffect(() => {
    if (authLoading || startupRecoveryState === 'recovering' || startupRecoveryState === 'retryable') return;
    async function init() {
      const requestedRecoveryRetry = recoveryRetryRequested.current;
      const allowBlockedRetry = Boolean(
        requestedRecoveryRetry
        && googleUser?.email
        && normalizeAccountEmail(requestedRecoveryRetry.email) === normalizeAccountEmail(googleUser.email)
        && (!requestedRecoveryRetry.sub || requestedRecoveryRetry.sub === googleUser.sub),
      );
      if (!allowBlockedRetry && recoveryRetryInFlight.current === requestedRecoveryRetry) {
        recoveryRetryInFlight.current = null;
        setRecoveryRetryPending(false);
      }
      recoveryRetryRequested.current = null;
      let retryGatePending = false;
      try {
        const db = await getDb();

        // Remove any debug-only QA rows if a release build is installed over a
        // debug build. This is local cleanup only; no production account is
        // touched because purgeQaSandbox targets the reserved QA sub exactly.
        if (!isQaSandboxBuildAvailable()) await purgeQaSandbox(db);

        let resolvedUserId = 1;
        if (googleUser?.email) {
          const isQa = isQaSandboxIdentity(googleUser);
          if (isQa) qaSeedInFlight.current = true;
          try {
          // Check the deletion marker before resolving/creating a local row.
          // If a process died after purging SQLite, resolving first would
          // provision a new row and make the old marker look like a mismatch.
          const deleteResult = !isQa ? await completePendingDelete(googleUser) : 'none';
          if (deleteResult === 'deleted') {
            setResolvedUserId(1);
          } else if (deleteResult === 'blocked') {
            setResolvedUserId(1);
            setAccountRecoveryError(true);
            console.warn('[sync] pending account deletion is unresolved; skipping local account resolution and cloud restore/upload');
          } else {
            const resetReady = isQa ? true : await completePendingReset(googleUser);
            if (!resetReady) {
              setAccountRecoveryError(true);
              console.warn('[sync] pending progress reset is unresolved; skipping cloud restore/upload');
            } else {
              if (isQa) {
                resolvedUserId = await seedQaSandbox(db);
                qaSeededForSub.current = googleUser.sub;
                setResolvedUserId(resolvedUserId);
              } else {
                const result = await resolveUserRow(db, googleUser.sub ?? googleUser.email, googleUser.email);
                resolvedUserId = result.id;
                setResolvedUserId(resolvedUserId);
                // Restore first. If the authenticated backup endpoint is
                // unavailable, do not let an empty/reseeded SQLite file become
                // an upload that can mask the user's cloud copy, and do not
                // publish an apparently empty account to the user either.
                if (allowBlockedRetry) retryGatePending = true;
                const restoreResult = await restoreUserDataIfNeeded(
                  resolvedUserId,
                  googleUser.email,
                  googleUser.sub,
                  () => {
                    const currentUser = googleUserRef.current;
                    return Boolean(
                      currentUser?.email
                      && normalizeAccountEmail(currentUser.email) === normalizeAccountEmail(googleUser.email)
                      && (!googleUser.sub || currentUser.sub === googleUser.sub),
                    );
                  },
                  allowBlockedRetry,
                  allowBlockedRetry
                    ? () => {
                      retryGatePending = false;
                      setRecoveryRetryPending(false);
                      if (recoveryRetryInFlight.current === requestedRecoveryRetry) {
                        recoveryRetryInFlight.current = null;
                      }
                    }
                    : undefined,
                  // A normal cold start may be recovering from an earlier
                  // transient offline failure. Re-probe only a retryable
                  // fresh/seeded block; the user-facing Retry button keeps
                  // its full reconciliation behavior by leaving this false.
                  !allowBlockedRetry,
                );
                if (restoreResult === 'unavailable') {
                  setAccountRecoveryError(true);
                  console.warn('[sync] cloud restore is unavailable; keeping account recovery blocked');
                } else {
                  requestCurrentUserSync()
                    .then(() => {
                      queryClient.invalidateQueries({ queryKey: ['rank'] });
                      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
                    })
                    .catch((error) => {
                      console.warn('[sync] activity log sync failed:', error);
                  });
                }
              }
            }
          }
          } finally {
            if (isQa) qaSeedInFlight.current = false;
          }
        }

        setDbReady(true);
      } finally {
        if ((!allowBlockedRetry || !retryGatePending)
            && recoveryRetryInFlight.current === requestedRecoveryRetry) {
          recoveryRetryInFlight.current = null;
          setRecoveryRetryPending(false);
        }
      }
    }
    init().catch(err => {
      console.error('DB init failed:', err);
      setDbError(err instanceof Error ? err.message : String(err));
    });
  // googleUser intentionally captured via closure: init() runs once when auth
  // settles. Fresh sign-ins resolve userId via signInWithGoogle() instead.
  // retryCount bumped by retryInit() to re-trigger this effect after user taps Retry.
  }, [authLoading, retryCount, startupRecoveryState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auth restoration can publish the QA identity one render after the DB init
  // effect above has already settled with the default local user. Reconcile
  // that ordering explicitly so a cold restart always gets a fresh local
  // fixture before any QA screen reads the database.
  useEffect(() => {
    const qaSub = googleUser?.sub;
    if (
      authLoading ||
      !dbReady ||
      !isOnboarded ||
      !qaSub ||
      !isQaSandboxIdentity(googleUser) ||
      qaSeededForSub.current === qaSub ||
      qaSeedInFlight.current
    ) return;

    // signInWithGoogle() seeds before publishing the identity. This branch
    // records that path without reseeding it just because the app re-rendered.
    if (userId !== 1) {
      qaSeededForSub.current = qaSub;
      return;
    }

    let disposed = false;
    qaSeedInFlight.current = true;
    void (async () => {
      try {
        const db = await getDb();
        const resolvedQaUserId = await seedQaSandbox(db);
        qaSeededForSub.current = qaSub;
        queryClient.clear();
        if (!disposed) setResolvedUserId(resolvedQaUserId);
      } catch (error) {
        if (!disposed) {
          console.error('[qa] sandbox startup reseed failed:', error);
          setDbError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        qaSeedInFlight.current = false;
      }
    })();

    return () => { disposed = true; };
  }, [authLoading, dbReady, googleUser?.sub, isOnboarded, userId]);

  const qaFixturePending = Boolean(
    isQaSandboxIdentity(googleUser) &&
    googleUser?.sub &&
    userId === 1 &&
    qaSeededForSub.current !== googleUser.sub,
  );

  useEffect(() => {
    if (!dbReady || !isOnboarded || !googleUser?.email || qaFixturePending || isQaSandboxIdentity(googleUser)) return;
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
  }, [dbReady, isOnboarded, userId, lang, googleUser?.email, googleUser?.sub, qaFixturePending]);

  // Android clears AlarmManager-backed local notifications on events the app
  // never hears about (force-stop, OS "unused apps" auto-restriction, an
  // update/reinstall) -- scheduleAllHabitReminders is otherwise only called
  // from Settings, so a wiped schedule stayed wiped forever with the saved
  // time still showing in Settings. Re-arm from the DB on cold start and
  // every foreground so the OS schedule can't silently drift from it.
  useEffect(() => {
    if (!dbReady || !isOnboarded || !googleUser?.email || qaFixturePending || isQaSandboxIdentity(googleUser)) return;
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
  }, [dbReady, isOnboarded, userId, lang, googleUser?.email, googleUser?.sub, qaFixturePending]);

  if (accountRecoveryError || startupRecoveryState === 'retryable') {
    const retryBusy = recoveryRetryPending || recoveryRetryInFlight.current !== null;
    return <AuthRecoveryScreen
      backgroundColor={colors.bgBase}
      textColor={colors.ink2}
      buttonColor={colors.primary}
      buttonTextColor={colors.onAccent}
      message={t.signInRecoveryFailed}
      buttonLabel={t.friendsRetry}
      busyLabel={t.syncWaitingForConnection}
      busy={retryBusy}
      onRetry={() => void handleAccountRecoveryRetry()}
    />;
  }

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

  if (!dbReady || authLoading || !fontsLoaded || qaFixturePending) {
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
          onEnterQaSandbox={() => signInWithGoogle(createQaSandboxUser())}
          onResetQaSandbox={handleQaSandboxReset}
          onSignOut={signOut}
          onDeleteAccount={deleteAccount}
        />
        <SyncStatusBanner />
        <Toast config={toastConfig} />
      </TutorialProvider>
    </GoogleUserContext.Provider>
    </UserIdContext.Provider>
  );
}

const appStyles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorMsg: { fontSize: 15, textAlign: 'center', marginBottom: 20, lineHeight: 22 },
  retryBtn: { minHeight: 44, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10, justifyContent: 'center' },
  retryBtnDisabled: { opacity: 0.65 },
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
