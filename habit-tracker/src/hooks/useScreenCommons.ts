import { useMemo } from 'react';
import { useAuthUser, useGoogleUser } from './useAuth';
import { useTheme, useTranslations } from './useSettings';
import type { AppColors } from '../config/theme';

export function useScreenCommons<T>(makeStylesFn: (c: AppColors) => T) {
  const userId = useAuthUser();
  const googleUser = useGoogleUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStylesFn(colors), [colors, makeStylesFn]);
  return { userId, googleUser, colors, t, styles };
}
