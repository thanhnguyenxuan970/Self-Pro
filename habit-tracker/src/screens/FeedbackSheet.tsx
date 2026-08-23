import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, ScrollView, StyleSheet,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Typography, Radii, Spacing, AppColors, FontFamily } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useGoogleUser } from '../hooks/useAuth';
import { submitFeedback } from '../api/feedbackService';
import { FeedbackType, FEEDBACK_MAX_LENGTH, validateFeedbackMessage } from '../utils/feedbackLogic';
import { AppButton } from '../components/AppButton';
import { BottomSheetFrame } from '../components/BottomSheetFrame';

interface Props { visible: boolean; onClose: () => void; }

// This sheet is the manual, user-initiated feedback form — it never offers
// SURVEY_D0 as a selectable type (that's the auto-triggered SurveyD0Sheet).
type ManualFeedbackType = Exclude<FeedbackType, 'SURVEY_D0'>;

const TYPES: { key: ManualFeedbackType; icon: string }[] = [
  { key: 'BUG', icon: '🐛' },
  { key: 'SUGGESTION', icon: '💡' },
  { key: 'OTHER', icon: '💬' },
];

export function FeedbackSheet({ visible, onClose }: Props) {
  const googleUser = useGoogleUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [type, setType] = useState<ManualFeedbackType>('BUG');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  // React state re-renders asynchronously, leaving a window for two rapid
  // taps to both pass the `!sending` check before the first re-render lands.
  // A ref is readable/settable synchronously in the same tick, matching the
  // guard AddActivitySheet uses for the same reason.
  const submittingRef = useRef(false);

  const typeLabel: Record<ManualFeedbackType, string> = {
    BUG: t.feedbackTypeBug,
    SUGGESTION: t.feedbackTypeSuggestion,
    OTHER: t.feedbackTypeOther,
  };

  const canSend = validateFeedbackMessage(message) && !sending;

  function handleClose() {
    setMessage('');
    setType('BUG');
    onClose();
  }

  async function handleSend() {
    if (!canSend || submittingRef.current) return;
    submittingRef.current = true;
    setSending(true);
    try {
      const result = await submitFeedback({
        type,
        message,
        userEmail: googleUser?.email ?? null,
      });
      if (result === 'OK') {
        Toast.show({ type: 'success', text1: t.feedbackThanks, visibilityTime: 2500 });
        handleClose();
      } else if (result === 'RATE_LIMITED') {
        Alert.alert(t.error, t.feedbackTooSoon);
      } else if (result === 'INVALID') {
        Alert.alert(t.error, t.feedbackTooShort);
      } else if (result === 'UNAVAILABLE') {
        Alert.alert(t.error, t.feedbackUnavailable);
      } else {
        Alert.alert(t.error, t.feedbackFailed);
      }
    } catch {
      Alert.alert(t.error, t.feedbackFailed);
    } finally {
      submittingRef.current = false;
      setSending(false);
    }
  }

  return (
    <BottomSheetFrame visible={visible} onClose={handleClose} closeLabel={t.close}>
      <View style={styles.handle} />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t.feedbackTitle}</Text>

        <View style={styles.typeRow} accessibilityRole="radiogroup">
          {TYPES.map(({ key, icon }) => (
            <TouchableOpacity
              key={key}
              style={[styles.typeChip, type === key && styles.typeChipActive]}
              onPress={() => setType(key)}
              activeOpacity={0.75}
              accessibilityRole="radio"
              accessibilityLabel={typeLabel[key]}
              accessibilityState={{ checked: type === key }}
            >
              <Text style={[styles.typeChipText, type === key && styles.typeChipTextActive]} numberOfLines={2}>
                {icon} {typeLabel[key]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.input}
          value={message}
          onChangeText={setMessage}
          placeholder={t.feedbackPlaceholder}
          placeholderTextColor={colors.faint}
          multiline
          maxLength={FEEDBACK_MAX_LENGTH}
          textAlignVertical="top"
          accessibilityLabel={t.feedbackPlaceholder}
        />
        {/* Array.from counts Unicode codepoints (matches the server's char_length check),
            not UTF-16 code units, so astral-plane emoji don't overstate the count by 2x. */}
        <Text style={styles.counter}>{Array.from(message.trim()).length}/{FEEDBACK_MAX_LENGTH}</Text>

        <AppButton
          label={t.feedbackSend}
          onPress={handleSend}
          disabled={!canSend}
          loading={sending}
          style={styles.sendBtn}
        />

        <AppButton label={t.cancel} variant="ghost" style={styles.cancelBtn} onPress={handleClose} disabled={sending} />
      </ScrollView>
    </BottomSheetFrame>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    handle: {
      width: 40, height: 4, backgroundColor: C.line2,
      borderRadius: Radii.pill, alignSelf: 'center', marginBottom: 10,
    },
    title: { ...Typography.bodyStrong, fontSize: 18, color: C.inkDark, marginBottom: Spacing.md },
    typeRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },
    typeChip: {
      flex: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 10, borderRadius: Radii.md,
      backgroundColor: C.surface2, borderWidth: 1.5, borderColor: C.line2,
      alignItems: 'center',
    },
    typeChipActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
    typeChipText: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.muted },
    typeChipTextActive: { color: C.primaryText },
    input: {
      backgroundColor: C.surface2, color: C.inkDark, padding: 13,
      borderRadius: Radii.md, fontSize: 14, minHeight: 110,
      borderWidth: 1.5, borderColor: C.line2,
    },
    counter: { fontSize: 11, color: C.faint, textAlign: 'right', marginTop: 4, marginBottom: Spacing.sm },
    sendBtn: { marginBottom: 8 },
    cancelBtn: { minHeight: 44 },
  });
}
