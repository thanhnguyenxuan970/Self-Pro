import React, { useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, NativeModules,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Typography, Radii, Spacing, AppColors, FontFamily } from '../config/theme';
import { useTheme, useTranslations, useLanguage } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useGoogleUser } from '../hooks/useAuth';
import { submitFeedback } from '../api/feedbackService';
import {
  FEEDBACK_MAX_LENGTH, SURVEY_D0_VERSION, validateFeedbackMessage,
  SurveyD0Answers, SurveyD0Q1, SurveyD0Q2, SurveyD0Q3, SurveyD0Q4, SurveyD0Q5,
} from '../utils/feedbackLogic';
import { resolveDeviceLocaleTag, resolveDeviceLanguageCode, DeviceLocale } from '../utils/localeLogic';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props { visible: boolean; onClose: () => void; }

const TOTAL_STEPS = 6;
const Q4_KEYS: SurveyD0Q4[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Fisher–Yates. Q4's own option order is randomized once per sheet instance
 *  to avoid position bias (see the survey doc's Q4 note) — the recorded
 *  answer is always the option's fixed canonical letter, never its
 *  on-screen position. */
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function SurveyD0Sheet({ visible, onClose }: Props) {
  const googleUser = useGoogleUser();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const t = useTranslations();
  const [appLang] = useLanguage();
  const { bottom } = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, bottom), [colors, bottom]);

  const [step, setStep] = useState(1);
  const [q1, setQ1] = useState<SurveyD0Q1 | null>(null);
  const [q2, setQ2] = useState<SurveyD0Q2 | null>(null);
  const [q3, setQ3] = useState<SurveyD0Q3[]>([]);
  const [q4, setQ4] = useState<SurveyD0Q4 | null>(null);
  const [q5, setQ5] = useState<SurveyD0Q5 | null>(null);
  const [q6, setQ6] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [q4Order] = useState(() => shuffled(Q4_KEYS));

  function reset() {
    setStep(1); setQ1(null); setQ2(null); setQ3([]); setQ4(null); setQ5(null); setQ6('');
  }

  function handleSkip() {
    reset();
    onClose();
  }

  function toggleQ3(key: SurveyD0Q3) {
    setQ3(prev => {
      if (key === 'F') return prev.includes('F') ? [] : ['F'];
      const withoutF = prev.filter(v => v !== 'F');
      return withoutF.includes(key) ? withoutF.filter(v => v !== key) : [...withoutF, key];
    });
  }

  const canAdvance = (
    (step === 1 && q1 !== null) ||
    (step === 2 && q2 !== null) ||
    (step === 3 && q3.length > 0) ||
    (step === 4 && q4 !== null) ||
    (step === 5 && q5 !== null) ||
    // Q6 is optional but still bound to the normal min/max when non-empty.
    (step === 6 && validateFeedbackMessage(q6, 'SURVEY_D0'))
  );

  async function handleSubmit() {
    if (!canAdvance || submittingRef.current || q1 === null || q2 === null || q4 === null || q5 === null) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      // Lazily required, and gated behind the NativeModules registry check —
      // same reasoning as SettingsContext.tsx: a JS-only reload/OTA update can
      // reach a device whose native binary predates this dependency, and
      // requireNativeModule() crashes the whole app rather than throwing a
      // catchable error if invoked directly. Falling back to 'unknown' here
      // only degrades this one answer's precision, never blocks the submit.
      let locales: DeviceLocale[] = [];
      try {
        if (NativeModules.ExpoLocalization) {
          const Localization = require('expo-localization');
          locales = Localization.getLocales();
        }
      } catch { /* fall through with locales = [] */ }
      const answers: SurveyD0Answers = {
        survey: SURVEY_D0_VERSION,
        q1_motivation: q1,
        q2_impression: q2,
        q3_friction: q3,
        q4_feature: q4,
        q5_return_intent: q5,
        // Self-recorded, never asked — see the survey doc's point 3.
        locale: resolveDeviceLocaleTag(locales),
        device_lang: resolveDeviceLanguageCode(locales),
        app_lang: appLang,
      };
      const result = await submitFeedback({
        type: 'SURVEY_D0',
        message: q6,
        userEmail: googleUser?.email ?? null,
        answers,
      });
      if (result === 'OK') {
        Toast.show({ type: 'success', text1: t.surveyThanks, visibilityTime: 2200 });
      } else if (__DEV__) {
        console.warn('[SurveyD0Sheet] submit did not return OK:', result);
      }
      // Shown-once already latched at display time (see pendingSurveyD0.ts) —
      // close either way rather than trapping the user on a retry loop.
      reset();
      onClose();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (!canAdvance) return;
    if (step === TOTAL_STEPS) { handleSubmit(); return; }
    setStep(s => s + 1);
  }

  function handleBack() {
    setStep(s => Math.max(1, s - 1));
  }

  function Choice({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
    return (
      <TouchableOpacity
        style={[styles.choice, selected && styles.choiceActive]}
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
      >
        <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  function MultiChoice({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
    return (
      <TouchableOpacity
        style={[styles.choice, selected && styles.choiceActive]}
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
      >
        <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <>
            <Text style={styles.question}>{t.surveyQ1}</Text>
            {(['A', 'B', 'C', 'D', 'E'] as SurveyD0Q1[]).map(key => (
              <Choice key={key} selected={q1 === key} onPress={() => setQ1(key)}
                label={t[`surveyQ1Opt${key}` as keyof typeof t] as string} />
            ))}
          </>
        );
      case 2:
        return (
          <>
            <Text style={styles.question}>{t.surveyQ2}</Text>
            {(['A', 'B', 'C', 'D', 'E'] as SurveyD0Q2[]).map(key => (
              <Choice key={key} selected={q2 === key} onPress={() => setQ2(key)}
                label={t[`surveyQ2Opt${key}` as keyof typeof t] as string} />
            ))}
          </>
        );
      case 3:
        return (
          <>
            <Text style={styles.question}>{t.surveyQ3}</Text>
            {(['A', 'B', 'C', 'D', 'E', 'F'] as SurveyD0Q3[]).map(key => (
              <MultiChoice key={key} selected={q3.includes(key)} onPress={() => toggleQ3(key)}
                label={t[`surveyQ3Opt${key}` as keyof typeof t] as string} />
            ))}
          </>
        );
      case 4:
        return (
          <>
            <Text style={styles.question}>{t.surveyQ4}</Text>
            {q4Order.map(key => (
              <Choice key={key} selected={q4 === key} onPress={() => setQ4(key)}
                label={t[`surveyQ4Opt${key}` as keyof typeof t] as string} />
            ))}
          </>
        );
      case 5:
        return (
          <>
            <Text style={styles.question}>{t.surveyQ5}</Text>
            {(['A', 'B', 'C', 'D'] as SurveyD0Q5[]).map(key => (
              <Choice key={key} selected={q5 === key} onPress={() => setQ5(key)}
                label={t[`surveyQ5Opt${key}` as keyof typeof t] as string} />
            ))}
          </>
        );
      case 6:
        return (
          <>
            <Text style={styles.question}>{t.surveyQ6}</Text>
            <TextInput
              style={styles.input}
              value={q6}
              onChangeText={setQ6}
              placeholder={t.surveyQ6Placeholder}
              placeholderTextColor={colors.faint}
              multiline
              maxLength={FEEDBACK_MAX_LENGTH}
              textAlignVertical="top"
              accessibilityLabel={t.surveyQ6Placeholder}
            />
          </>
        );
      default:
        return null;
    }
  }

  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={handleSkip} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleSkip} accessibilityRole="button" accessibilityLabel={t.surveySkip} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>{t.surveyD0Title}</Text>
            <TouchableOpacity onPress={handleSkip} accessibilityRole="button" accessibilityLabel={t.surveySkip} hitSlop={12}>
              <Text style={styles.skip}>{t.surveySkip}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.progress}>{t.surveyProgress(step, TOTAL_STEPS)}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.scroll}>
            {renderStep()}
          </ScrollView>

          <View style={styles.navRow}>
            {step > 1 ? (
              <TouchableOpacity style={styles.backBtn} onPress={handleBack} disabled={submitting} accessibilityRole="button" accessibilityLabel={t.surveyBack}>
                <Text style={styles.backText}>{t.surveyBack}</Text>
              </TouchableOpacity>
            ) : <View style={styles.backBtn} />}
            <TouchableOpacity
              style={[styles.nextBtn, !canAdvance && styles.nextBtnDisabled]}
              onPress={handleNext}
              disabled={!canAdvance || submitting}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canAdvance || submitting }}
            >
              <Text style={[styles.nextText, !canAdvance && styles.nextTextDisabled]}>
                {submitting ? '…' : step === TOTAL_STEPS ? t.surveySubmit : t.surveyNext}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(C: AppColors, bottomInset: number) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: C.scrim, justifyContent: 'flex-end' },
    sheet: {
      maxHeight: '90%', alignSelf: 'center', width: '100%', maxWidth: 480,
      backgroundColor: C.surface, paddingTop: Spacing.xl, paddingHorizontal: Spacing.xl,
      paddingBottom: Spacing.xl + bottomInset,
      borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl,
    },
    handle: {
      width: 40, height: 4, backgroundColor: C.line2,
      borderRadius: Radii.pill, alignSelf: 'center', marginBottom: 10,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { ...Typography.bodyStrong, fontSize: 18, color: C.inkDark, flexShrink: 1 },
    skip: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.muted, minHeight: 44, textAlignVertical: 'center', paddingLeft: Spacing.md },
    progress: { fontSize: 11, color: C.faint, marginTop: Spacing.sm },
    progressTrack: { height: 4, borderRadius: Radii.pill, backgroundColor: C.line2, marginTop: 6, marginBottom: Spacing.md, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: C.primary, borderRadius: Radii.pill },
    scroll: { flexGrow: 0 },
    question: { ...Typography.bodyStrong, fontSize: 15, color: C.inkDark, marginBottom: Spacing.md },
    choice: {
      minHeight: 48, justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 14,
      borderRadius: Radii.md, backgroundColor: C.surface2, borderWidth: 1.5, borderColor: C.line2,
      marginBottom: 8,
    },
    choiceActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
    choiceText: { fontSize: 14, fontFamily: FontFamily.medium, color: C.ink2 },
    choiceTextActive: { color: C.primaryText, fontFamily: FontFamily.semiBold },
    input: {
      backgroundColor: C.surface2, color: C.inkDark, padding: 13,
      borderRadius: Radii.md, fontSize: 14, minHeight: 110,
      borderWidth: 1.5, borderColor: C.line2,
    },
    navRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.md },
    backBtn: { minWidth: 72, minHeight: 48, justifyContent: 'center', alignItems: 'flex-start' },
    backText: { fontSize: 14, color: C.muted, fontFamily: FontFamily.semiBold },
    nextBtn: { flex: 1, backgroundColor: C.primary, paddingVertical: 14, borderRadius: Radii.md, alignItems: 'center' },
    nextBtnDisabled: { backgroundColor: C.line2 },
    nextText: { color: C.onAccent, fontSize: 15, fontFamily: FontFamily.bold },
    nextTextDisabled: { color: C.ink2 },
  });
}
