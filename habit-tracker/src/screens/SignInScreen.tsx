import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { GoogleUser } from '../hooks/useAuth';
import { Typography, Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { useThemedScreenState } from '../hooks/useThemedScreenState';

type Props = {
  onSignIn: () => void;
  onSignInWithGoogle: (user: GoogleUser, idToken?: string) => Promise<boolean>;
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

// Brand mark, matching the Habi Analytics promo "closing" logo exactly:
// always brand green (never the accent), an 82%-sweep progress ring with a
// gold dot at 12 o'clock and a checkmark that draws in AFTER the ring, the
// whole mark popping up in scale. Shown only for unauthenticated users (this
// screen mounts only in the signed-out stack). Reduce-motion paints the final
// frame directly.
const BRAND = '#25B36E'; // logo is always brand green, independent of accent
const GOLD = '#E0A93B';
const GOOGLE_BLUE = '#1967D2'; // Google's brand blue, darkened from #4285F4 to clear WCAG AA on the button surface

function useSignInIntro(reduceMotion: boolean) {
  const ringDraw = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const checkDraw = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const logoPop = useRef(new Animated.Value(reduceMotion ? 1 : 0.8)).current;
  const markOpacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const contentRise = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    ringDraw.setValue(0);
    checkDraw.setValue(0);
    logoPop.setValue(0.8);
    markOpacity.setValue(0);
    contentRise.setValue(0);
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(markOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(logoPop, { toValue: 1, duration: 520, easing: Easing.out(Easing.back(1.7)), useNativeDriver: true }),
        Animated.sequence([
          // Ring sweeps on first, then the check draws in behind it.
          Animated.timing(ringDraw, { toValue: 1, duration: 660, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
          Animated.timing(checkDraw, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
      Animated.timing(contentRise, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [reduceMotion, ringDraw, checkDraw, logoPop, markOpacity, contentRise]);

  return { ringDraw, checkDraw, logoPop, markOpacity, contentRise };
}

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
  const { loading, setLoading, colors, t, reduceMotion, styles } = useThemedScreenState(makeStyles);
  const { ringDraw, checkDraw, logoPop, markOpacity, contentRise } = useSignInIntro(reduceMotion);

  // viewBox 0 0 100 100, ring radius 40 (matches the promo mark). The ring is
  // an 82%-length arc: dash the arc, gap the rest, and sweep the dashoffset
  // from hidden to 0. The check path (~70 units) draws the same way.
  const RING_C = 2 * Math.PI * 40;
  const ARC_LEN = RING_C * 0.82;
  const CHECK_LEN = 70;
  const ringOffset = ringDraw.interpolate({ inputRange: [0, 1], outputRange: [ARC_LEN, 0] });
  const checkOffset = checkDraw.interpolate({ inputRange: [0, 1], outputRange: [CHECK_LEN, 0] });
  const contentTranslate = contentRise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

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
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Animated.View style={[styles.logoContainer, { opacity: markOpacity, transform: [{ scale: logoPop }] }]}>
          <Svg width={96} height={96} viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="40" fill="none" stroke="rgba(37,179,110,0.22)" strokeWidth="9" />
            <AnimatedCircle
              cx="50" cy="50" r="40"
              fill="none" stroke={BRAND} strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${ARC_LEN} ${RING_C}`}
              strokeDashoffset={ringOffset}
              transform="rotate(-90 50 50)"
            />
            <Circle cx="50" cy="10" r="6" fill={GOLD} />
            <AnimatedPath
              d="M35 51 L46 62 L67 39"
              fill="none" stroke={BRAND} strokeWidth="8"
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={CHECK_LEN}
              strokeDashoffset={checkOffset}
            />
          </Svg>
        </Animated.View>
        <Animated.View style={{ width: '100%', alignItems: 'center', opacity: contentRise, transform: [{ translateY: contentTranslate }] }}>
          <Text style={styles.title}>Hab<Text style={{ color: BRAND }}>i</Text></Text>

          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: Spacing.xl }} />
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
        </Animated.View>
      </View>
    </SafeAreaView>
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
    title: { ...Typography.title, color: C.inkDark, marginBottom: Spacing.lg },
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
    googleIcon: { fontSize: 18, fontFamily: FontFamily.bold, color: GOOGLE_BLUE, marginRight: 10 },
    googleButtonText: { color: C.inkDark, fontFamily: FontFamily.semiBold, fontSize: 16 },
    hint: {
      ...Typography.caption,
      color: C.muted,
      marginTop: Spacing.lg,
      textAlign: 'center',
    },
  });
}
