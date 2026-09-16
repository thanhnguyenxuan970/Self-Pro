import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { FontFamily } from '../config/theme';

export type AuthRecoveryScreenProps = {
  backgroundColor: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  message: string;
  buttonLabel: string;
  busyLabel?: string;
  busy: boolean;
  onRetry: () => void;
};

/**
 * The startup recovery surface is deliberately side-effect free. Tests can
 * inject a timeout into the auth/session layer and render this same component
 * without adding a fault switch or debug path to the shipped app.
 */
export function AuthRecoveryScreen({
  backgroundColor,
  textColor,
  buttonColor,
  buttonTextColor,
  message,
  buttonLabel,
  busyLabel = buttonLabel,
  busy,
  onRetry,
}: AuthRecoveryScreenProps) {
  return (
    <View style={[styles.center, { backgroundColor }]}>
      <Text style={[styles.message, { color: textColor }]}>{message}</Text>
      <TouchableOpacity
        style={[styles.retryButton, { backgroundColor: buttonColor }, busy && styles.retryButtonDisabled]}
        onPress={onRetry}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={busy ? busyLabel : buttonLabel}
        accessibilityState={{ busy, disabled: busy }}
      >
        <Text style={[styles.retryText, { color: buttonTextColor }]}>{busy ? busyLabel : buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  message: { fontSize: 15, textAlign: 'center', marginBottom: 20, lineHeight: 22 },
  retryButton: { minHeight: 44, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10, justifyContent: 'center' },
  retryButtonDisabled: { opacity: 0.65 },
  retryText: { fontSize: 15, fontFamily: FontFamily.semiBold },
});
