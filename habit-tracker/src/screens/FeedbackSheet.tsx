import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Typography, Radii, Spacing, AppColors } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useGoogleUser } from '../hooks/useAuth';
import { submitFeedback } from '../api/feedbackService';
import { FeedbackType, FEEDBACK_MAX_LENGTH, validateFeedbackMessage } from '../utils/feedbackLogic';

interface Props { visible: boolean; onClose: () => void; }

const TYPES: { key: FeedbackType; icon: string }[] = [
  { key: 'BUG', icon: '🐛' },
  { key: 'SUGGESTION', icon: '💡' },
  { key: 'OTHER', icon: '💬' },
];

export function FeedbackSheet({ visible, onClose }: Props) {
  const googleUser = useGoogleUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [type, setType] = useState<FeedbackType>('BUG');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const typeLabel: Record<FeedbackType, string> = {
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
    if (!canSend) return;
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
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t.feedbackTitle}</Text>

          <View style={styles.typeRow}>
            {TYPES.map(({ key, icon }) => (
              <TouchableOpacity
                key={key}
                style={[styles.typeChip, type === key && styles.typeChipActive]}
                onPress={() => setType(key)}
                activeOpacity={0.75}
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
          />
          <Text style={styles.counter}>{message.trim().length}/{FEEDBACK_MAX_LENGTH}</Text>

          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            activeOpacity={0.8}
          >
            <Text style={styles.sendBtnText}>{sending ? '…' : t.feedbackSend}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleClose} disabled={sending}>
            <Text style={styles.cancel}>{t.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: C.surface, padding: Spacing.xl,
      borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl,
    },
    handle: {
      width: 40, height: 4, backgroundColor: C.line2,
      borderRadius: Radii.pill, alignSelf: 'center', marginBottom: 10,
    },
    title: { ...Typography.bodyStrong, fontSize: 18, color: C.inkDark, marginBottom: Spacing.md },
    typeRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },
    typeChip: {
      flex: 1, paddingVertical: 10, borderRadius: Radii.md,
      backgroundColor: C.surface2, borderWidth: 1.5, borderColor: C.line2,
      alignItems: 'center',
    },
    typeChipActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
    typeChipText: { fontSize: 13, fontWeight: '600', color: C.muted },
    typeChipTextActive: { color: C.primary },
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
    sendBtnText: { color: C.white, fontSize: 15, fontWeight: '700' },
    cancel: { textAlign: 'center', color: C.muted, padding: 8 },
  });
}
