import React, { useState, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, NativeModules } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { GoogleUser } from '../hooks/useAuth';
import { Typography, Radii, Spacing, Shadows, AppColors } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';

type Props = {
  onSignIn: () => void;
  onSignInWithGoogle: (user: GoogleUser, idToken?: string) => Promise<boolean>;
};

export function SignInScreen({ onSignIn, onSignInWithGoogle }: Props) {
  const [loading, setLoading] = useState(false);
  const configuredRef = useRef(false);
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const googleAvailable = !!NativeModules.RNGoogleSignin;

  async function handleGoogleSignIn() {
    setLoading(true);
    try {
      if (!googleAvailable) {
        Alert.alert(t.error, t.signInLibError);
        setLoading(false);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } =
        require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
      if (!configuredRef.current) {
        GoogleSignin.configure({
          webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        });
        configuredRef.current = true;
      }
      try {
        await GoogleSignin.hasPlayServices();
        // Clear any cached session so the account picker always appears
        try { await GoogleSignin.signOut(); } catch {}
        const response = await GoogleSignin.signIn();
        if (isSuccessResponse(response)) {
          const { email, name, photo } = response.data.user;
          const idToken = response.data.idToken ?? undefined;
          if (!email || !name) {
            Alert.alert(t.error, t.signInMissingInfo);
            return;
          }
          const isNew = await onSignInWithGoogle({ email, name, picture: photo ?? '' }, idToken);
          // Only go to onboarding for new users; returning users skip straight to app
          if (isNew) onSignIn();
        }
      } catch (error: any) {
        if (isErrorWithCode(error)) {
          if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
          if (error.code === statusCodes.IN_PROGRESS) return;
          if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            Alert.alert(t.error, t.signInNoPlayServices);
            return;
          }
          // DEVELOPER_ERROR (10): SHA-1 or package mismatch in Firebase/Google Cloud Console
          if ((error as any).code === 10) {
            Alert.alert(t.error, 'Google OAuth not configured for this build. Add debug SHA-1 to Firebase → Android app → Fingerprints, then re-download google-services.json.');
            return;
          }
        }
        const msg = error instanceof Error ? `${(error as any).code ?? ''}: ${error.message}` : String(error);
        Alert.alert(t.error, msg);
      }
    } catch {
      Alert.alert(t.error, t.signInLibError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.logoContainer}>
          <Svg width={64} height={64} viewBox="0 0 60 60">
            <Circle
              cx="30" cy="30" r="22"
              fill="none" stroke="#22C55E" strokeWidth="6"
              strokeLinecap="round" strokeDasharray="115 24"
              transform="rotate(90 30 30)"
            />
            <Circle cx="30" cy="30" r="11" fill="#22C55E" />
            <Path
              d="M24.5 30 L28.5 34 L36 26.5"
              stroke="white" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </View>
        <Text style={styles.title}>Habit ring</Text>
        <Text style={styles.subtitle}>daily completion, the loop</Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: Spacing.xl }} />
        ) : (
          <>
            {googleAvailable && (
              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogleSignIn}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleButtonText}>Đăng nhập bằng Google</Text>
              </TouchableOpacity>
            )}
            {__DEV__ && (
              <TouchableOpacity
                style={[styles.devButton, !googleAvailable && styles.devButtonPrimary]}
                onPress={async () => {
                  setLoading(true);
                  try {
                    const isNew = await onSignInWithGoogle({ email: 'dev@habitring.app', name: 'Dev User', picture: '' });
                    if (isNew) onSignIn();
                  } catch {
                    Alert.alert(t.error, 'Dev login failed');
                  } finally {
                    setLoading(false);
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.devButtonText}>{googleAvailable ? '⚡ Dev Login (skip Google)' : '⚡ Dev Login (Google unavailable in Expo Go)'}</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <Text style={styles.hint}>MVP · Xác thực qua Google · Dữ liệu lưu trên máy</Text>
      </View>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.bgBase,
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
    },
    card: {
      backgroundColor: C.surface,
      borderRadius: Radii.xxl,
      padding: Spacing.xl,
      alignItems: 'center',
      ...Shadows.medium,
    },
    logoContainer: { marginBottom: Spacing.sm },
    title: { ...Typography.title, color: C.inkDark, marginBottom: 4 },
    subtitle: {
      ...Typography.body,
      color: C.muted,
      textAlign: 'center',
      marginBottom: Spacing.xl,
    },
    googleButton: {
      width: '100%',
      backgroundColor: C.surface2,
      borderRadius: Radii.md,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Spacing.sm,
      borderWidth: 1,
      borderColor: C.line,
      ...Shadows.light,
    },
    googleIcon: { fontSize: 18, fontWeight: '700', color: '#4285F4', marginRight: 10 },
    googleButtonText: { color: C.inkDark, fontWeight: '600', fontSize: 16 },
    devButton: {
      marginTop: Spacing.sm,
      paddingVertical: 10,
      paddingHorizontal: Spacing.md,
      borderRadius: Radii.md,
      backgroundColor: '#1a1a2e',
      alignItems: 'center',
    },
    devButtonPrimary: {
      paddingVertical: 14,
      width: '100%',
    },
    devButtonText: { color: '#00ff88', fontSize: 13, fontWeight: '600' },
    hint: {
      ...Typography.caption,
      color: C.faint,
      marginTop: Spacing.lg,
      textAlign: 'center',
    },
  });
}
