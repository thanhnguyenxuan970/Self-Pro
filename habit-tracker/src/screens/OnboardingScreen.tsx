import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Animated,
  BackHandler,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Typography, Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { useLanguage } from '../hooks/useSettings';
import { RankMascot } from '../components/RankMascot';
import { useThemedScreenState } from '../hooks/useThemedScreenState';

const GENDER_KEY = 'habit_gender';
const BIRTH_YEAR_KEY = 'habit_birth_year';

type Gender = 'male' | 'female' | 'other';
type Props = { onComplete: () => Promise<void> };

export function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep] = useState<0 | 1>(0);
  const [gender, setGender] = useState<Gender | null>(null);
  const [birthYear, setBirthYear] = useState('');
  const [lang, setLanguage] = useLanguage();
  const { loading, setLoading, colors, t, reduceMotion, styles } = useThemedScreenState(makeStyles);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) { fadeAnim.setValue(1); slideAnim.setValue(0); return; }
    fadeAnim.setValue(0);
    slideAnim.setValue(24);
    const anim = Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 100, friction: 8, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [step]);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 1) {
        setStep(0);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [step]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const saves: Promise<void>[] = [];
      if (gender) saves.push(AsyncStorage.setItem(GENDER_KEY, gender));
      const year = birthYear.trim();
      if (year) saves.push(AsyncStorage.setItem(BIRTH_YEAR_KEY, year));
      await Promise.all(saves);
      await onComplete();
    } catch {
      Alert.alert(t.error, t.onboardError);
      setLoading(false);
    }
  };

  const genderOptions: { key: Gender; label: string }[] = [
    { key: 'male', label: t.onboardGenderMale },
    { key: 'female', label: t.onboardGenderFemale },
    { key: 'other', label: t.onboardGenderOther },
  ];

  const benefits = [t.onboardHeroBenefit1, t.onboardHeroBenefit2, t.onboardHeroBenefit3];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bgBase }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {step === 0 ? (
            <View style={styles.hero}>
              {/* Language switcher */}
              <View style={styles.langRow}>
                {(['vi', 'en'] as const).map(l => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.langBtn, lang === l && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}
                    onPress={() => setLanguage(l)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={l === 'vi' ? 'Tiếng Việt' : 'English'}
                    accessibilityState={{ selected: lang === l }}
                  >
                    <Text style={styles.langFlag}>{l === 'vi' ? '🇻🇳' : '🇺🇸'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Mascot */}
              <Animated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: Spacing.sm }}>
                <RankMascot tier={0} size={100} loop reduceMotion={reduceMotion} />
              </Animated.View>

              {/* Headline */}
              <Text style={styles.heroAppName}>Habi</Text>
              <Text style={styles.heroTagline}>{t.onboardHeroTagline}</Text>

              {/* Benefit cards */}
              <View style={styles.benefits}>
                {benefits.map((b, i) => (
                  <View key={i} style={[styles.benefit, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    <Text style={[styles.benefitText, { color: colors.ink2 }]}>{b}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={styles.button} onPress={() => setStep(1)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.onboardHeroCta}>
                <Text style={styles.buttonText}>{t.onboardHeroCta}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.setup}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(0)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t.back}>
                <Text style={[styles.backText, { color: colors.muted }]}>{t.back}</Text>
              </TouchableOpacity>

              <Text style={styles.setupTitle}>{t.onboardSetupTitle}</Text>
              <Text style={[styles.setupSubtitle, { color: colors.ink2 }]}>{t.onboardSetupSubtitle}</Text>

              {/* Gender */}
              <Text style={styles.fieldLabel}>{t.onboardGenderLabel}</Text>
              <View style={styles.optionRow}>
                {genderOptions.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.optionBtn, gender === opt.key && styles.optionBtnActive]}
                    onPress={() => setGender(opt.key)}
                    activeOpacity={0.7}
                    accessibilityRole="radio"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ checked: gender === opt.key }}
                  >
                    <Text style={[styles.optionBtnText, gender === opt.key && styles.optionBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Birth year */}
              <Text style={styles.fieldLabel}>{t.onboardBirthYearOptional}</Text>
              <TextInput
                style={styles.input}
                value={birthYear}
                onChangeText={setBirthYear}
                placeholder={t.onboardBirthYearPlaceholder}
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                maxLength={4}
                returnKeyType="done"
                accessibilityLabel={t.onboardBirthYearOptional}
              />

              <TouchableOpacity
                style={[styles.button, styles.buttonTop, loading && styles.buttonDisabled]}
                onPress={handleStart}
                disabled={loading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t.onboardStart}
              >
                {loading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.buttonText}>{t.onboardStart}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    scroll: { flexGrow: 1, paddingBottom: 48 },

    // ── HERO ──────────────────────────────────────────
    hero: {
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingTop: 56,
    },
    langRow: {
      flexDirection: 'row',
      gap: 8,
      alignSelf: 'flex-end',
      marginBottom: Spacing.lg,
    },
    langBtn: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: Radii.sm,
      borderWidth: 1.5,
      borderColor: C.line2,
    },
    langFlag: { fontSize: 20 },
    heroAppName: {
      fontSize: 42,
      fontFamily: FontFamily.extraBold,
      letterSpacing: -1.5,
      color: C.primary,
      marginBottom: 6,
    },
    heroTagline: {
      fontSize: 16,
      fontFamily: FontFamily.semiBold,
      color: C.inkDark,
      textAlign: 'center',
      lineHeight: 23,
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.xl,
    },
    benefits: {
      width: '100%',
      gap: 10,
      marginBottom: Spacing.xl,
    },
    benefit: {
      borderRadius: Radii.md,
      paddingVertical: 14,
      paddingHorizontal: Spacing.md,
      borderWidth: 1,
    },
    benefitText: {
      fontSize: 15,
      fontFamily: FontFamily.semiBold,
    },

    // ── SHARED ────────────────────────────────────────
    button: {
      backgroundColor: C.primary,
      borderRadius: Radii.md,
      paddingVertical: 16,
      alignItems: 'center',
      width: '100%',
      ...Shadows.hero,
      shadowColor: C.primary,
    },
    buttonTop: { marginTop: 40 },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: C.white, fontFamily: FontFamily.bold, fontSize: 16 },

    // ── SETUP ─────────────────────────────────────────
    setup: {
      paddingHorizontal: Spacing.lg,
      paddingTop: 56,
    },
    backBtn: { minHeight: 44, justifyContent: 'center', marginBottom: Spacing.lg },
    backText: { fontSize: 15, fontFamily: FontFamily.semiBold },
    setupTitle: {
      ...Typography.title,
      color: C.inkDark,
      marginBottom: 6,
    },
    setupSubtitle: {
      ...Typography.body,
      marginBottom: Spacing.xl,
    },
    fieldLabel: {
      fontSize: 13,
      fontFamily: FontFamily.semiBold,
      color: C.ink2,
      marginBottom: 10,
      marginTop: Spacing.lg,
    },
    optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    optionBtn: {
      minHeight: 44,
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: Radii.pill,
      borderWidth: 1.5,
      borderColor: C.line2,
      backgroundColor: C.surface,
    },
    optionBtnActive: {
      borderColor: C.primary,
      backgroundColor: C.primarySoft,
    },
    optionBtnText: { fontSize: 14, fontFamily: FontFamily.semiBold, color: C.inkDark },
    optionBtnTextActive: { color: C.primaryPress },
    input: {
      backgroundColor: C.surface2,
      color: C.inkDark,
      padding: 14,
      borderRadius: Radii.md,
      fontSize: 16,
      fontFamily: FontFamily.semiBold,
      borderWidth: 1.5,
      borderColor: C.line2,
    },
  });
}
