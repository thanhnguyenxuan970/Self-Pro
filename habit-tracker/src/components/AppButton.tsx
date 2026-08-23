import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
} from 'react-native';
import { AppColors, FontFamily, Opacity, Radii, Spacing } from '../config/theme';
import { useTheme } from '../hooks/useSettings';
import {
  getAppButtonAccessibilityState,
  getAppButtonPresentation,
  type AppButtonVariant,
} from './uiPrimitives';

export { getAppButtonAccessibilityState, getAppButtonPresentation } from './uiPrimitives';

type AppButtonProps = Omit<TouchableOpacityProps, 'children'> & {
  label: string;
  variant?: AppButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  onPress,
  style,
  ...props
}: AppButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const presentation = getAppButtonPresentation(variant, disabled, loading);

  return (
    <TouchableOpacity
      {...props}
      style={[styles.base, styles[presentation.variant], presentation.disabled && variant !== 'ghost' && styles.disabled, style]}
      onPress={onPress}
      disabled={presentation.disabled}
      activeOpacity={Opacity.pressed}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={getAppButtonAccessibilityState(accessibilityState, disabled, loading)}
    >
      {loading ? (
          <ActivityIndicator color={presentation.disabled ? colors.inkDark : textColor(colors, variant)} />
      ) : (
        <Text
          style={[styles.label, styles[`${variant}Label` as keyof typeof styles] as object, presentation.disabled && styles.disabledLabel]}
          numberOfLines={presentation.numberOfLines}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function textColor(colors: AppColors, variant: AppButtonVariant): string {
  if (variant === 'primary' || variant === 'danger') return colors.onAccent;
  return colors.inkDark;
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    base: {
      minHeight: 48,
      width: '100%',
      paddingHorizontal: Spacing.lg,
      paddingVertical: 11,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: { backgroundColor: C.primary },
    secondary: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line2 },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: C.dangerPress },
    disabled: { backgroundColor: C.line2, borderColor: C.line2, opacity: 1 },
    disabledLabel: { color: C.disabledInk },
    label: { maxWidth: '100%', textAlign: 'center', fontFamily: FontFamily.semiBold, fontSize: 15, lineHeight: 22 },
    primaryLabel: { color: C.onAccent },
    secondaryLabel: { color: C.inkDark },
    ghostLabel: { color: C.ink2 },
    dangerLabel: { color: C.onAccent },
  });
}
