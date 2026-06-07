import React, { useState, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, NativeModules } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
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
    if (!googleAvailable) {
      Alert.alert(
        'Development Build Required',
        'Google Sign-In requires a native build.\n\nRun: npx expo run:android'
      );
      return;
    }
    setLoading(true);
    try {
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
        try { await GoogleSignin.signOut(); } catch {}
        const res = await GoogleSignin.signIn();
        if (isSuccessResponse(res)) {
          const { email, name, photo } = res.data.user;
          const idToken = res.data.idToken ?? undefined;
          if (!email || !name) {
            Alert.alert(t.error, t.signInMissingInfo);
            return;
          }
          const isNew = await onSignInWithGoogle({ email, name, picture: photo ?? '' }, idToken);
          if (isNew) onSignIn();
        }
      } catch (error: unknown) {
        if (isErrorWithCode(error)) {
          if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
          if (error.code === statusCodes.IN_PROGRESS) return;
          if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            Alert.alert(t.error, t.signInNoPlayServices);
            return;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((error as any).code === 10) {
            Alert.alert(t.error, 'Google OAuth not configured for this build. Add debug SHA-1 to Firebase → Android app → Fingerprints, then re-download google-services.json.');
            return;
          }
        }
        const msg = error instanceof Error ? `${(error as { code?: unknown }).code ?? ''}: ${error.message}` : String(error);
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
          <Svg width={88} height={88} viewBox="0 0 60 60">
            <Rect x="0" y="0" width="60" height="60" rx="14" ry="14" fill="#E6F4EC" />
            <Circle cx="30" cy="30" r="17" fill="none" stroke="#C6E9D5" strokeWidth="6.5" />
            <Path
              d="M30,13 A17,17 0 1 1 13,30"
              fill="none" stroke="#25B36E" strokeWidth="6.5"
              strokeLinecap="round"
            />
            <Circle cx="13" cy="30" r="2.4" fill="#E0A93B" />
            <Path
              d="M23,31 L28,36 L38,25"
              fill="none" stroke="#0F7A50" strokeWidth="4.5"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </Svg>
        </View>
        <Text style={styles.title}>
          {'habit '}
          <Text style={{ color: colors.primary }}>ring</Text>
        </Text>
        <Text style={styles.subtitle}>daily completion, the loop</Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: Spacing.xl }} />
        ) : (
          <>
            <TouchableOpacity
              style={[styles.googleButton, !googleAvailable && styles.googleButtonDisabled]}
              onPress={handleGoogleSignIn}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Đăng nhập bằng Google</Text>
            </TouchableOpacity>
            {!googleAvailable && (
              <Text style={styles.buildHint}>Requires native build (expo run:android)</Text>
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
    googleButtonDisabled: {
      opacity: 0.5,
    },
    googleIcon: { fontSize: 18, fontWeight: '700', color: '#4285F4', marginRight: 10 },
    googleButtonText: { color: C.inkDark, fontWeight: '600', fontSize: 16 },
    buildHint: {
      ...Typography.caption,
      color: C.muted,
      marginTop: 6,
      textAlign: 'center',
    },
    hint: {
      ...Typography.caption,
      color: C.faint,
      marginTop: Spacing.lg,
      textAlign: 'center',
    },
  });
}
