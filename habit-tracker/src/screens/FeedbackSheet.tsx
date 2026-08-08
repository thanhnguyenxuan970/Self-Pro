import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, Image, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { Typography, Radii, Spacing, AppColors, FontFamily } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useGoogleUser } from '../hooks/useAuth';
import { submitFeedback } from '../api/feedbackService';
import { FeedbackType, FEEDBACK_MAX_LENGTH, validateFeedbackMessage } from '../utils/feedbackLogic';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props { visible: boolean; onClose: () => void; }

const TYPES: { key: FeedbackType; icon: string }[] = [
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

  const [type, setType] = useState<FeedbackType>('BUG');
  const [message, setMessage] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
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
    setImageUri(null);
    onClose();
  }

  async function handlePickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t.error, t.feedbackImagePermission);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    try {
      const result = await submitFeedback({
        type,
        message,
        userEmail: googleUser?.email ?? null,
        imageUri,
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
          <Text style={styles.counter}>{message.trim().length}/{FEEDBACK_MAX_LENGTH}</Text>

          <View style={styles.imageRow}>
            {imageUri ? (
              <View style={styles.imagePreviewer}>
                <Image source={{ uri: imageUri }} style={styles.imageThumb} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.imageRemoveBtn}
                  onPress={() => setImageUri(null)}
                  disabled={sending}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={t.cancel}
                >
                  <Text style={styles.imageRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.imagePickBtn}
                onPress={handlePickImage}
                disabled={sending}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={t.feedbackAttachImage}
              >
                <Text style={styles.imagePickText}>📎 {t.feedbackAttachImage}</Text>
              </TouchableOpacity>
            )}
          </View>

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
    imageRow: { marginBottom: Spacing.sm },
    imagePickBtn: {
      flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
      backgroundColor: C.surface2, borderRadius: Radii.md,
      paddingVertical: 8, paddingHorizontal: 14,
      borderWidth: 1.5, borderColor: C.line2,
    },
    imagePickText: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.inkDark },
    imagePreviewer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    imageThumb: {
      width: 72, height: 72, borderRadius: Radii.md,
      borderWidth: 1, borderColor: C.line2,
    },
    imageRemoveBtn: {
      backgroundColor: C.surface2, borderRadius: 12,
      width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: C.line2,
    },
    imageRemoveText: { fontSize: 12, fontFamily: FontFamily.bold, color: C.muted },
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
