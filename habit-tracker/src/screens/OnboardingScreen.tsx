import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Typography, Radii, Spacing, Shadows, AppColors } from '../config/theme';
import { useTheme, useTranslations, useLanguage } from '../hooks/useSettings';

const GENDER_KEY = 'habit_gender';
const BIRTH_YEAR_KEY = 'habit_birth_year';

type Gender = 'male' | 'female' | 'other';
type Props = { onComplete: () => Promise<void> };

export function OnboardingScreen({ onComplete }: Props) {
  const [gender, setGender] = useState<Gender | null>(null);
  const [birthYear, setBirthYear] = useState('');
  const [lang, setLanguage] = useLanguage();
  const [loading, setLoading] = useState(false);
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t.onboardTitle}</Text>
        <Text style={styles.subtitle}>{t.onboardSubtitle}</Text>

        {/* Language */}
        <Text style={styles.label}>{t.onboardLangLabel}</Text>
        <View style={styles.optionRow}>
          {(['vi', 'en'] as const).map(l => (
            <TouchableOpacity
              key={l}
              style={[styles.optionBtn, lang === l && styles.optionBtnActive]}
              onPress={() => setLanguage(l)}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionBtnText, lang === l && styles.optionBtnTextActive]}>
                {l === 'vi' ? t.onboardLangVi : t.onboardLangEn}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Gender */}
        <Text style={styles.label}>{t.onboardGenderLabel}</Text>
        <View style={styles.optionRow}>
          {genderOptions.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.optionBtn, gender === opt.key && styles.optionBtnActive]}
              onPress={() => setGender(opt.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionBtnText, gender === opt.key && styles.optionBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Birth Year */}
        <Text style={styles.label}>{t.onboardBirthYearLabel}</Text>
        <TextInput
          style={styles.input}
          value={birthYear}
          onChangeText={setBirthYear}
          placeholder={t.onboardBirthYearPlaceholder}
          placeholderTextColor={colors.faint}
          keyboardType="number-pad"
          maxLength={4}
          returnKeyType="done"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleStart}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>{t.onboardStart}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bgBase },
    content: {
      paddingHorizontal: Spacing.lg,
      paddingTop: 72,
      paddingBottom: 48,
    },
    title: { ...Typography.title, color: C.inkDark, marginBottom: 8 },
    subtitle: { ...Typography.body, color: C.muted, marginBottom: Spacing.xl },
    label: {
      fontSize: 12, fontWeight: '700', color: C.muted,
      textTransform: 'uppercase', letterSpacing: 0.7,
      marginBottom: 10, marginTop: Spacing.lg,
    },
    optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    optionBtn: {
      paddingVertical: 10, paddingHorizontal: 16,
      borderRadius: Radii.pill, borderWidth: 1.5,
      borderColor: C.line2, backgroundColor: C.surface,
    },
    optionBtnActive: {
      borderColor: C.primary, backgroundColor: C.primarySoft,
    },
    optionBtnText: { fontSize: 14, fontWeight: '600', color: C.inkDark },
    optionBtnTextActive: { color: C.primaryPress },
    input: {
      backgroundColor: C.surface2, color: C.inkDark, padding: 14,
      borderRadius: Radii.md, fontSize: 16, fontWeight: '600',
      borderWidth: 1.5, borderColor: C.line2,
    },
    button: {
      marginTop: 40,
      backgroundColor: C.primary,
      borderRadius: Radii.md,
      paddingVertical: 16,
      alignItems: 'center',
      ...Shadows.hero,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: C.white, fontWeight: '700', fontSize: 16 },
  });
}
