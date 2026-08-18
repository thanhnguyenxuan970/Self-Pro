import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, useWindowDimensions } from 'react-native';
import { AppColors, FontFamily, Radii, Shadows } from '../../config/theme';

export type OverflowMenuItem = {
  label: string;
  onPress: () => void;
  danger?: boolean;
};

type Props = {
  items: OverflowMenuItem[];
  ariaLabel: string;
  dismissLabel: string;
  colors: AppColors;
  disabled?: boolean;
};

/**
 * The row-level "⋮" button and its anchored dropdown. Each row owns its own
 * instance (only one is ever open, since only one can be tapped at a time),
 * rendered as a transparent Modal rather than an absolutely-positioned
 * sibling — a FlatList row can be clipped or re-measured during
 * virtualization/scroll, which an in-row absolute overlay can't survive.
 */
export function OverflowMenu({ items, ariaLabel, dismissLabel, colors, disabled }: Props) {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null);
  const buttonRef = useRef<View>(null);
  const { width: screenWidth } = useWindowDimensions();
  const styles = makeStyles(colors);

  function open() {
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ right: Math.max(8, screenWidth - (x + width)), top: y + height + 4 });
      setVisible(true);
    });
  }

  return (
    <>
      <TouchableOpacity
        ref={buttonRef}
        onPress={open}
        disabled={disabled}
        hitSlop={10}
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        accessibilityRole="button"
        accessibilityLabel={ariaLabel}
      >
        <Text style={styles.triggerText}>⋮</Text>
      </TouchableOpacity>
      {/* Rendered only while open, not just visually hidden — a list of ~50
          rows (the backend's incoming-request cap) would otherwise mount 50
          native Android overlay windows permanently, since Modal creates one
          even at visible={false}. */}
      {visible && (
        <Modal visible transparent animationType="none" onRequestClose={() => setVisible(false)} statusBarTranslucent navigationBarTranslucent>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setVisible(false)}
            accessibilityRole="button"
            accessibilityLabel={dismissLabel}
          />
          {anchor && (
            <View style={[styles.menu, { right: anchor.right, top: anchor.top }]} accessibilityViewIsModal>
              {items.map((item, index) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.menuRow, index < items.length - 1 && styles.menuRowBorder]}
                  onPress={() => { setVisible(false); item.onPress(); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <Text style={[styles.menuText, item.danger && { color: colors.dangerText }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Modal>
      )}
    </>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    trigger: { width: 28, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    triggerDisabled: { opacity: 0.4 },
    triggerText: { fontSize: 18, fontFamily: FontFamily.bold, color: C.muted },
    menu: {
      position: 'absolute', width: 162,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      borderRadius: Radii.md, ...Shadows.medium, overflow: 'hidden',
    },
    menuRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
    menuRowBorder: { borderBottomWidth: 1, borderColor: C.line },
    menuText: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.inkDark },
  });
}
