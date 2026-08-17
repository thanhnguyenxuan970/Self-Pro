import React, { useState, useMemo, useRef } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Typography, Radii, Spacing, AppColors, FontFamily } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useGoogleUser } from '../hooks/useAuth';
import { submitFeedback } from '../api/feedbackService';
import { FeedbackType, FEEDBACK_MAX_LENGTH, validateFeedbackMessage } from '../utils/feedbackLogic';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const reduceMotion = useReduceMotion();
  const t = useTranslations();
  const { bottom } = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, bottom), [colors, bottom]);

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
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={handleClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} accessibilityRole="button" accessibilityLabel={t.close} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{t.feedbackTitle}</Text>

          <View style={styles.typeRow}>
            {TYPES.map(({ key, icon }) => (
              <TouchableOpacity
                key={key}
                style={[styles.typeChip, type === key && styles.typeChipActive]}
                onPress={() => setType(key)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ selected: type === key }}
              >
                <Text style={[styles.typeChipText, type === key && styles.typeChipTextActive]}>
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

          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend }}
          >
            <Text style={[styles.sendBtnText, !canSend && styles.sendBtnDisabledText]}>{sending ? '…' : t.feedbackSend}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={sending} accessibilityRole="button" accessibilityLabel={t.cancel}>
            <Text style={styles.cancel}>{t.cancel}</Text>
          </TouchableOpacity>
          </ScrollView>
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
    sendBtn: {
      backgroundColor: C.primary, padding: 15, borderRadius: Radii.md,
      alignItems: 'center', marginBottom: 8,
    },
    sendBtnDisabled: { backgroundColor: C.line2 },
    sendBtnText: { color: C.onAccent, fontSize: 15, fontFamily: FontFamily.bold },
    sendBtnDisabledText: { color: C.ink2 },
    cancelBtn: { minHeight: 44, justifyContent: 'center' },
    cancel: { textAlign: 'center', color: C.muted, padding: 8 },
  });
}
