import React, { ReactNode, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radii, Shadows, Spacing } from '../config/theme';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useTheme } from '../hooks/useSettings';
import { getBottomSheetAnimationType } from './uiPrimitives';

export { getBottomSheetAnimationType } from './uiPrimitives';

type Props = {
  visible: boolean;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  maxHeight?: ViewStyle['maxHeight'];
};

export function BottomSheetFrame({ visible, onClose, closeLabel, children, contentStyle, maxHeight = '90%' }: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const { bottom } = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, bottom), [colors, bottom]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={getBottomSheetAnimationType(reduceMotion)}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.backdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
          />
          <View style={[styles.sheet, { maxHeight }, contentStyle]} accessibilityViewIsModal>
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>['colors'], bottomInset: number) {
  return StyleSheet.create({
    kav: { flex: 1 },
    backdrop: { flex: 1, backgroundColor: C.scrim, justifyContent: 'flex-end' },
    sheet: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: 480,
      backgroundColor: C.surface,
      paddingTop: Spacing.xl,
      paddingHorizontal: Spacing.xl,
      paddingBottom: Spacing.xl + bottomInset,
      borderTopLeftRadius: Radii.xxl,
      borderTopRightRadius: Radii.xxl,
      ...Shadows.hero,
    },
  });
}
