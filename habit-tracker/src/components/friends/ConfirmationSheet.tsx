import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors, FontFamily, Radii, Spacing } from '../../config/theme';
import { useReduceMotion } from '../../hooks/useReduceMotion';

type Props = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  confirmBusyLabel: string;
  dismissLabel: string;
  // Remove/Block/Rotate are destructive (danger fill). Cancel-request and
  // Unblock are not — they take the primary fill but still sit in the same
  // first slot ahead of the dismiss button.
  tone: 'destructive' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  colors: AppColors;
};

/**
 * One shared sheet for Remove/Block/Cancel-request/Rotate-code and Unblock:
 * title, one-sentence consequence, the action first (destructive or primary
 * fill depending on `tone`), dismiss second. In-flight keeps the sheet open
 * with the action button busy rather than closing immediately.
 */
export function ConfirmationSheet({ visible, title, body, confirmLabel, confirmBusyLabel, dismissLabel, tone, busy, onConfirm, onDismiss, colors }: Props) {
  const reduceMotion = useReduceMotion();
  const { bottom } = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, bottom), [colors, bottom]);

  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onDismiss} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityRole="button" accessibilityLabel={dismissLabel} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.grip} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <TouchableOpacity
            style={[styles.confirmBtn, tone === 'destructive' ? styles.confirmDanger : styles.confirmPrimary, busy && styles.busy]}
            onPress={onConfirm}
            disabled={busy}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={busy ? confirmBusyLabel : confirmLabel}
          >
            {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.confirmText}>{confirmLabel}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={dismissLabel}>
            <Text style={styles.dismissText}>{dismissLabel}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(C: AppColors, bottomInset: number) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: C.scrim },
    sheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl,
      paddingHorizontal: Spacing.lg, paddingTop: 12, paddingBottom: 20 + bottomInset,
      alignSelf: 'center', width: '100%', maxWidth: 480,
    },
    grip: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 16 },
    title: { fontSize: 18, fontFamily: FontFamily.bold, color: C.inkDark },
    body: { fontSize: 14, lineHeight: 20, fontFamily: FontFamily.regular, color: C.ink2, marginTop: 8 },
    confirmBtn: { marginTop: 20, minHeight: 48, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' },
    // White ink on plain `danger` fails AA (4.46:1 light / 3.62:1 dark) — the
    // same reason the pending-count badge uses `dangerPress` instead.
    confirmDanger: { backgroundColor: C.dangerPress },
    confirmPrimary: { backgroundColor: C.primary },
    busy: { opacity: 0.55 },
    confirmText: { fontSize: 15, fontFamily: FontFamily.bold, color: C.onAccent },
    dismissBtn: { marginTop: 10, minHeight: 48, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' },
    dismissText: { fontSize: 15, fontFamily: FontFamily.semiBold, color: C.ink2 },
  });
}
