export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type AppButtonAccessibilityState = {
  disabled?: boolean;
  selected?: boolean;
  checked?: boolean | 'mixed';
  busy?: boolean;
  expanded?: boolean;
};

export function getAppButtonAccessibilityState(
  accessibilityState: AppButtonAccessibilityState | undefined,
  disabled: boolean | undefined,
  loading: boolean,
): AppButtonAccessibilityState {
  return {
    ...accessibilityState,
    disabled: Boolean(disabled || loading),
    ...(loading ? { busy: true } : {}),
  };
}

export function getAppButtonPresentation(
  variant: AppButtonVariant,
  disabled: boolean | undefined,
  loading: boolean,
) {
  return {
    variant,
    disabled: Boolean(disabled || loading),
    numberOfLines: 2 as const,
  };
}

export function getBottomSheetAnimationType(reduceMotion: boolean): 'none' | 'slide' {
  return reduceMotion ? 'none' : 'slide';
}
