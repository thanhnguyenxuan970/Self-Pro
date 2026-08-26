import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors, FontFamily, Radii, Spacing } from '../../config/theme';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { FRIEND_CODE_LENGTH, filterFriendCodeInput, isStickyResult, resultBannerTone, type FriendActionResult } from '../../lib/friends';
import { OverflowMenu } from './OverflowMenu';
import { ConfirmationSheet } from './ConfirmationSheet';

export type AddFriendSheetCopy = {
  title: string;
  close: string;
  yourCodeEyebrow: string;
  retry: string;
  retryError: string;
  copy: string;
  copied: string;
  share: string;
  rotate: string;
  overflowAria: string;
  enterCodeLabel: string;
  codeHelper: string;
  codeFiltered: (n: number) => string;
  submit: string;
  resultMessage: (result: FriendActionResult) => string | null;
  rotateTitle: string;
  rotateBody: string;
  rotateConfirm: string;
  rotateConfirming: string;
  confirmDismiss: string;
  shareMessage: (code: string) => string;
};

type Props = {
  visible: boolean;
  colors: AppColors;
  copy: AddFriendSheetCopy;
  code: string | null;
  codeLoading: boolean;
  codeUnavailable: boolean;
  onRetryCode: () => Promise<unknown>;
  onRotateCode: () => Promise<unknown>;
  rotating: boolean;
  onSubmitCode: (code: string) => Promise<FriendActionResult>;
  submitting: boolean;
  onClose: () => void;
};

/**
 * Two jobs, one reading order: share my code, then enter someone else's. The
 * six visible cells are decorative — one real, labelled `TextInput` sits
 * behind them so paste, selection, and screen readers all work normally.
 */
export function AddFriendSheet({ visible, colors, copy, code, codeLoading, codeUnavailable, onRetryCode, onRotateCode, rotating, onSubmitCode, submitting, onClose }: Props) {
  const reduceMotion = useReduceMotion();
  const { bottom } = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, bottom), [colors, bottom]);

  const [value, setValue] = useState('');
  const [filteredNotice, setFilteredNotice] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<FriendActionResult | null>(null);
  const [rotateConfirmVisible, setRotateConfirmVisible] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [retryingCode, setRetryingCode] = useState(false);
  const [retryError, setRetryError] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const rotateInFlightRef = useRef(false);
  const retryInFlightRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setValue('');
      setFilteredNotice(null);
      setLastResult(null);
      setCopiedNotice(false);
      setRetryError(false);
    }
  }, [visible]);

  function handleChangeText(raw: string) {
    const { value: nextValue, removedInvalidCount } = filterFriendCodeInput(raw);
    setValue(nextValue);
    // One message, once — replaced by the format hint on the next edit,
    // never stacked or left stale from a previous keystroke.
    setFilteredNotice(removedInvalidCount > 0 ? removedInvalidCount : null);
    setLastResult(null);
  }

  async function handleCopy() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopiedNotice(true);
  }

  async function handleRetryCode() {
    if (retryInFlightRef.current) return;
    retryInFlightRef.current = true;
    setRetryingCode(true);
    setRetryError(false);
    try {
      await onRetryCode();
    } catch {
      setRetryError(true);
    } finally {
      retryInFlightRef.current = false;
      setRetryingCode(false);
    }
  }

  async function handleRotateConfirm() {
    // A ref, not the `rotating` prop: prop/state only reflect the mutation's
    // pending status a render *later*, so a fast double-tap on Confirm can
    // fire onRotateCode() twice before it ever renders disabled — each
    // rotation invalidates the previous one, so a double-fire would silently
    // hand the user a code that isn't the one they just saw.
    if (rotateInFlightRef.current) return;
    rotateInFlightRef.current = true;
    // rotate_my_friend_code (unlike the status-returning RPCs) can genuinely
    // reject on a network/backend failure — always close rather than
    // leaving the sheet stuck open with no recovery.
    try {
      await onRotateCode();
    } catch {
      // Nothing more specific to show; the sheet closing is the recovery.
    } finally {
      rotateInFlightRef.current = false;
      setRotateConfirmVisible(false);
    }
  }

  async function handleShare() {
    if (!code) return;
    try {
      await Share.share({ message: copy.shareMessage(code) });
    } catch {
      // User-cancelled or platform share sheet failure — nothing to recover.
    }
  }

  async function handleSubmit() {
    const result = await onSubmitCode(value);
    setLastResult(result);
    if (result.status === 'ACCEPTED') {
      setValue('');
    }
  }

  const submitDisabled = value.length !== FRIEND_CODE_LENGTH || submitting || (lastResult !== null && isStickyResult(lastResult.status));
  const bannerTone = lastResult ? resultBannerTone(lastResult.status) : null;
  const bannerMessage = lastResult ? copy.resultMessage(lastResult) : null;
  const cells = Array.from({ length: FRIEND_CODE_LENGTH }, (_, i) => value[i] ?? '');

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={onClose}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={copy.close} />
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.grip} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>{copy.title}</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel={copy.close}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.eyebrow}>{copy.yourCodeEyebrow}</Text>
              <View style={styles.codeBlock}>
                <View style={styles.codeBlockHeader}>
                  {codeLoading ? (
                    <ActivityIndicator color={colors.primaryText} />
                  ) : codeUnavailable ? (
                    <View style={styles.codeUnavailableWrap}>
                      <Text style={styles.codeUnavailable}>—</Text>
                      <TouchableOpacity
                        style={styles.codeRetryBtn}
                        onPress={() => void handleRetryCode()}
                        disabled={codeLoading || retryingCode}
                        hitSlop={4}
                        accessibilityRole="button"
                        accessibilityLabel={copy.retry}
                      >
                        {retryingCode ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.codeRetryText}>{copy.retry}</Text>}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.codeText} accessibilityLabel={code ? code.split('').join(' ') : ''}>{code}</Text>
                  )}
                  <OverflowMenu
                    ariaLabel={copy.overflowAria}
                    dismissLabel={copy.confirmDismiss}
                    colors={colors}
                    items={[{ label: copy.rotate, onPress: () => setRotateConfirmVisible(true) }]}
                  />
                </View>
                {retryError && codeUnavailable ? (
                  <Text style={styles.codeRetryError} accessibilityLiveRegion="polite">{copy.retryError}</Text>
                ) : null}
                <View style={styles.codeActionsRow}>
                  <TouchableOpacity style={styles.codeActionBtn} onPress={() => void handleCopy()} disabled={!code} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={copiedNotice ? copy.copied : copy.copy}>
                    <Text style={styles.codeActionText}>{copiedNotice ? copy.copied : copy.copy}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.codeActionBtnOutline} onPress={() => void handleShare()} disabled={!code} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={copy.share}>
                    <Text style={styles.codeActionOutlineText}>{copy.share}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.divider} />

              <Text style={styles.enterLabel}>{copy.enterCodeLabel}</Text>
              <View style={styles.inputWrap}>
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => inputRef.current?.focus()} accessibilityElementsHidden importantForAccessibility="no" />
                <View style={styles.cellsRow} importantForAccessibility="no">
                  {cells.map((ch, i) => (
                    <View key={i} style={[styles.cell, ch ? styles.cellFilled : null]}>
                      <Text style={styles.cellText}>{ch}</Text>
                    </View>
                  ))}
                </View>
                <TextInput
                  ref={inputRef}
                  style={styles.hiddenInput}
                  value={value}
                  onChangeText={handleChangeText}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  maxLength={32}
                  accessibilityLabel={copy.enterCodeLabel}
                  accessibilityHint={copy.codeHelper}
                />
              </View>
              {filteredNotice !== null ? (
                <Text style={styles.helper} accessibilityLiveRegion="polite">{copy.codeFiltered(filteredNotice)}</Text>
              ) : (
                <Text style={styles.helper}>{copy.codeHelper}</Text>
              )}

              {bannerTone && bannerMessage && (
                <View
                  style={[styles.banner, bannerTone === 'success' && styles.bannerSuccess, bannerTone === 'warning' && styles.bannerWarning, bannerTone === 'danger' && styles.bannerDanger]}
                  accessibilityLiveRegion="polite"
                >
                  <Text style={[styles.bannerIcon, bannerTone === 'success' && { color: colors.primaryText }, bannerTone === 'warning' && { color: colors.starGoldText }, bannerTone === 'danger' && { color: colors.dangerText }]}>
                    {bannerTone === 'success' ? '✓' : '!'}
                  </Text>
                  <Text style={styles.bannerText}>{bannerMessage}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, submitDisabled && styles.submitDisabled]}
                onPress={() => void handleSubmit()}
                disabled={submitDisabled}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={copy.submit}
              >
                {submitting ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.submitText}>{copy.submit}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <ConfirmationSheet
        visible={rotateConfirmVisible}
        title={copy.rotateTitle}
        body={copy.rotateBody}
        confirmLabel={copy.rotateConfirm}
        confirmBusyLabel={copy.rotateConfirming}
        dismissLabel={copy.confirmDismiss}
        tone="destructive"
        busy={rotating}
        colors={colors}
        onDismiss={() => setRotateConfirmVisible(false)}
        onConfirm={() => void handleRotateConfirm()}
      />
    </>
  );
}

function makeStyles(C: AppColors, bottomInset: number) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: C.scrim },
    sheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl,
      paddingHorizontal: Spacing.lg, paddingTop: 12, paddingBottom: 26 + bottomInset,
      maxHeight: '88%', alignSelf: 'center', width: '100%', maxWidth: 480,
    },
    grip: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 16 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    title: { fontSize: 19, fontFamily: FontFamily.extraBold, letterSpacing: -0.4, color: C.inkDark },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
    closeText: { fontSize: 15, fontFamily: FontFamily.bold, color: C.ink2 },

    eyebrow: { fontSize: 12, fontFamily: FontFamily.semiBold, letterSpacing: 0.8, color: C.muted, marginBottom: 8 },
    codeBlock: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: Radii.md, padding: 14 },
    codeBlockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    codeText: { fontSize: 27, fontFamily: FontFamily.extraBold, letterSpacing: 7, color: C.inkDark },
    codeUnavailable: { fontSize: 27, fontFamily: FontFamily.extraBold, color: C.disabledInk },
    codeUnavailableWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    codeRetryBtn: { minHeight: 44, paddingHorizontal: 10, borderRadius: Radii.sm, justifyContent: 'center', backgroundColor: C.primarySoft },
    codeRetryText: { fontSize: 13, fontFamily: FontFamily.bold, color: C.primaryText },
    codeRetryError: { fontSize: 12, lineHeight: 17, fontFamily: FontFamily.semiBold, color: C.dangerText, marginTop: 8 },
    codeActionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    codeActionBtn: { flex: 1, minHeight: 44, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primarySoft },
    codeActionText: { fontSize: 13, fontFamily: FontFamily.bold, color: C.primaryText },
    codeActionBtnOutline: { flex: 1, minHeight: 44, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line2 },
    codeActionOutlineText: { fontSize: 13, fontFamily: FontFamily.bold, color: C.ink2 },

    divider: { height: 1, backgroundColor: C.line, marginVertical: 18, marginHorizontal: -Spacing.lg },

    enterLabel: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.ink2, marginBottom: 10 },
    inputWrap: { position: 'relative' },
    cellsRow: { flexDirection: 'row', gap: 8 },
    cell: { flex: 1, height: 52, borderWidth: 1.5, borderColor: C.line, borderRadius: Radii.md, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
    cellFilled: { borderColor: C.line2 },
    cellText: { fontSize: 21, fontFamily: FontFamily.extraBold, color: C.inkDark },
    hiddenInput: { position: 'absolute', opacity: 0, width: '100%', height: '100%' },
    helper: { fontSize: 12, fontFamily: FontFamily.regular, color: C.muted, marginTop: 8 },

    banner: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: Radii.md, borderWidth: 1, padding: 12, marginTop: 14 },
    bannerSuccess: { backgroundColor: C.primarySoft, borderColor: C.primaryPress },
    bannerWarning: { backgroundColor: C.starSoft, borderColor: C.starGold },
    bannerDanger: { backgroundColor: C.dangerSoft, borderColor: C.danger },
    bannerIcon: { fontSize: 15, fontFamily: FontFamily.extraBold },
    bannerText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: FontFamily.semiBold, color: C.inkDark },

    submitBtn: { marginTop: 16, minHeight: 48, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary },
    submitDisabled: { opacity: 0.4 },
    submitText: { fontSize: 15, fontFamily: FontFamily.bold, color: C.onAccent },
  });
}
