import React from 'react';
import { BaseToast, ErrorToast, ToastConfig, ToastConfigParams } from 'react-native-toast-message';
import { AppColors, FontFamily, Radii, Shadows } from './theme';

// react-native-toast-message ships with a fixed white/black default look that
// never reads theme.ts, so every log/streak/error toast broke dark mode and
// clashed with the app's rounded, token-driven surfaces. This mirrors the
// same surface/border/typography tokens TaskRow and modals already use.
export function createToastConfig(colors: AppColors): ToastConfig {
  const sharedStyle = {
    minHeight: 56,
    width: '90%' as const,
    borderRadius: Radii.md,
    borderLeftWidth: 4,
    backgroundColor: colors.surface,
    ...Shadows.medium,
  };
  const text1Style = { fontFamily: FontFamily.semiBold, fontSize: 14, color: colors.inkDark };
  const text2Style = { fontFamily: FontFamily.regular, fontSize: 12.5, color: colors.ink2 };

  function successToast(params: ToastConfigParams<unknown>) {
    return (
      <BaseToast
        {...params}
        style={[sharedStyle, { borderLeftColor: colors.primary }]}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        text1Style={text1Style}
        text2Style={text2Style}
      />
    );
  }

  return {
    success: successToast,
    info: successToast,
    error: (params: ToastConfigParams<unknown>) => (
      <ErrorToast
        {...params}
        style={[sharedStyle, { borderLeftColor: colors.dangerPress }]}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        text1Style={text1Style}
        text2Style={[text2Style, { color: colors.dangerText }]}
      />
    ),
  };
}
