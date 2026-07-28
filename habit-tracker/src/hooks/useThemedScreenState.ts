import { useMemo, useState } from 'react';
import { useTheme, useTranslations } from './useSettings';
import { useReduceMotion } from './useReduceMotion';
import type { AppColors } from '../config/theme';

/** Common pre-auth screen setup: loading flag, theme colors, translations,
 *  reduce-motion preference, and memoized styles. Shared by OnboardingScreen
 *  and SignInScreen, which run before useScreenCommons's auth context applies. */
export function useThemedScreenState<T>(makeStylesFn: (c: AppColors) => T) {
  const [loading, setLoading] = useState(false);
  const { colors } = useTheme();
  const t = useTranslations();
  const reduceMotion = useReduceMotion();
  const styles = useMemo(() => makeStylesFn(colors), [colors, makeStylesFn]);
  return { loading, setLoading, colors, t, reduceMotion, styles };
}
