import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { GoogleUser } from '../hooks/useAuth';
import { Typography, Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { ACCENTS } from '../config/accents';
import { useTheme, useTranslations } from '../hooks/useSettings';

const GREEN = ACCENTS.green.light;

type Props = {
  onSignIn: () => void;
  onSignInWithGoogle: (user: GoogleUser, idToken?: string) => Promise<boolean>;
};

// fallow-ignore-next-line complexity
function extractGoogleUser(response: { data?: { user?: { email?: string; name?: string; id?: string; photo?: string | null }; idToken?: string | null } | null }) {
  const user = response.data?.user;
  if (!user?.email || !user?.name) return null;
  return {
    googleUser: { sub: user.id ?? '', email: user.email, name: user.name, picture: user.photo ?? '' },
    idToken: response.data?.idToken ?? undefined,
  };
}

export function SignInScreen({ onSignIn, onSignInWithGoogle }: Props) {
  const [loading, setLoading] = useState(false);
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    // require() at call-time — avoids TurboModule registration race at bundle load
    const { GoogleSignin, statusCodes } = require('@react-native-google-signin/google-signin');
    try {
      GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      try { await GoogleSignin.signOut(); } catch { }
      const response = await GoogleSignin.signIn();
      const extracted = extractGoogleUser(response);
      if (!extracted) { Alert.alert(t.error, t.signInMissingInfo); return; }
      const isNew = await onSignInWithGoogle(extracted.googleUser, extracted.idToken);
      if (isNew) onSignIn();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== statusCodes.SIGN_IN_CANCELLED) {
        Alert.alert(t.error, err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  };

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
        <Text style={styles.title}>Habi</Text>
        <Text style={styles.subtitle}>{t.signInTagline}</Text>

        {loading ? (
          <ActivityIndicator size="large" color={GREEN.primary} style={{ marginTop: Spacing.xl }} />
        ) : (
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t.signInBtn}
          >
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.googleButtonText}>{t.signInBtn}</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.hint}>{t.signInHint}</Text>
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
    googleIcon: { fontSize: 18, fontFamily: FontFamily.bold, color: '#4285F4', marginRight: 10 },
    googleButtonText: { color: C.inkDark, fontFamily: FontFamily.semiBold, fontSize: 16 },
    hint: {
      ...Typography.caption,
      color: C.muted,
      marginTop: Spacing.lg,
      textAlign: 'center',
    },
  });
}
