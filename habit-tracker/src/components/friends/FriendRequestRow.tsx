import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import type { AppLanguage } from '../../config/i18n';
import { AppColors, FontFamily, Radii, Shadows } from '../../config/theme';
import { daysAgo, daysUntil, formatAbsoluteDate, formatAbsoluteDateTime, type FriendIncomingRow, type FriendOutgoingRow } from '../../lib/friends';
import { InitialsAvatar } from './InitialsAvatar';
import { OverflowMenu } from './OverflowMenu';

type FriendRequestRowCopy = {
  accept: string;
  reject: string;
  cancel: string;
  cancelling: string;
  accepting: string;
  rejecting: string;
  blockMenuItem: string;
  overflowAria: string;
  dismissLabel: string;
  sentAgoExpiresIn: (sentDays: number, expiresDays: number) => string;
  pendingOrdinal: (n: number) => string;
  outgoingMeta: (sent: string, expires: string) => string;
};

type IncomingProps = {
  row: FriendIncomingRow;
  playerLabel: string;
  colors: AppColors;
  copy: FriendRequestRowCopy;
  onAccept: (relationshipId: string) => void;
  onReject: (relationshipId: string) => void;
  onBlock: (relationshipId: string, displayName: string) => void;
  busyAction: 'accept' | 'reject' | null;
};

/**
 * Incoming request card — its own full card chrome (unlike outgoing rows,
 * which share one parent card), Accept primary + Reject secondary side by
 * side, Block behind the row's own overflow menu.
 */
export const IncomingRequestRow = React.memo(function IncomingRequestRow({ row, playerLabel, colors, copy, onAccept, onReject, onBlock, busyAction }: IncomingProps) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const now = new Date();
  const meta = copy.sentAgoExpiresIn(daysAgo(row.createdAt, now), daysUntil(row.expiresAt, now));

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <InitialsAvatar name={row.requesterDisplayName} playerId={row.requesterPlayerId} fallbackLabel={playerLabel} colors={colors} size={38} />
        <View style={styles.headerInfo}>
          <Text style={styles.name} numberOfLines={1}>{row.requesterDisplayName}</Text>
          <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        </View>
        <OverflowMenu
          ariaLabel={copy.overflowAria}
          dismissLabel={copy.dismissLabel}
          colors={colors}
          // Accept/Reject aren't behind a confirmation modal (unlike Remove/
          // Block elsewhere), so without this guard a Block could fire from
          // here while an Accept/Reject on the same relationship is still
          // in flight, racing it under the server's pair lock.
          disabled={busyAction !== null}
          items={[{ label: copy.blockMenuItem, danger: true, onPress: () => onBlock(row.relationshipId, row.requesterDisplayName) }]}
        />
      </View>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.acceptBtn, busyAction === 'reject' && styles.disabled]}
          onPress={() => onAccept(row.relationshipId)}
          disabled={busyAction !== null}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={busyAction === 'accept' ? copy.accepting : copy.accept}
        >
          {busyAction === 'accept' ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.acceptText}>{copy.accept}</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.rejectBtn, busyAction === 'accept' && styles.disabled]}
          onPress={() => onReject(row.relationshipId)}
          disabled={busyAction !== null}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={busyAction === 'reject' ? copy.rejecting : copy.reject}
        >
          {busyAction === 'reject' ? <ActivityIndicator color={colors.ink2} /> : <Text style={styles.rejectText}>{copy.reject}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
});

type OutgoingProps = {
  row: FriendOutgoingRow;
  isLast: boolean;
  lang: AppLanguage;
  colors: AppColors;
  copy: FriendRequestRowCopy;
  onCancel: (relationshipId: string) => void;
  busy: boolean;
};

/**
 * One outgoing-request row, meant to live inside a parent-owned card. The
 * recipient is never named or avatared — a dashed placeholder circle and an
 * ordinal ("Pending request N") stand in, matching §2.4's rule that the
 * requester can't identify who they're waiting on.
 */
export const OutgoingRequestRow = React.memo(function OutgoingRequestRow({ row, isLast, lang, colors, copy, onCancel, busy }: OutgoingProps) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const sent = formatAbsoluteDateTime(row.createdAt, lang);
  const expires = formatAbsoluteDate(row.expiresAt, lang);

  return (
    <View style={[styles.outgoingRow, !isLast && styles.outgoingRowBorder]}>
      <View style={styles.placeholderAvatar} importantForAccessibility="no">
        <Text style={styles.placeholderGlyph}>?</Text>
      </View>
      <View style={styles.headerInfo}>
        <Text style={styles.name} numberOfLines={1}>{copy.pendingOrdinal(row.ordinal)}</Text>
        <Text style={styles.meta} numberOfLines={1}>{copy.outgoingMeta(sent, expires)}</Text>
      </View>
      <TouchableOpacity
        style={[styles.cancelPill, busy && styles.cancelPillBusy]}
        onPress={() => onCancel(row.relationshipId)}
        disabled={busy}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={busy ? copy.cancelling : copy.cancel}
      >
        <Text style={[styles.cancelText, busy && { color: colors.disabledInk }]}>{busy ? copy.cancelling : copy.cancel}</Text>
      </TouchableOpacity>
    </View>
  );
});

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      borderRadius: Radii.lg, padding: 14, ...Shadows.light,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerInfo: { flex: 1, minWidth: 0 },
    name: { fontSize: 15, fontFamily: FontFamily.bold, color: C.inkDark },
    meta: { fontSize: 12, fontFamily: FontFamily.regular, color: C.muted, marginTop: 2 },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    acceptBtn: { flex: 1, minHeight: 44, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary },
    acceptText: { fontSize: 14, fontFamily: FontFamily.bold, color: C.onAccent },
    rejectBtn: { flex: 1, minHeight: 44, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line2 },
    rejectText: { fontSize: 14, fontFamily: FontFamily.semiBold, color: C.ink2 },
    disabled: { opacity: 0.55 },

    outgoingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
    outgoingRowBorder: { borderBottomWidth: 1, borderColor: C.line },
    placeholderAvatar: {
      width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line2,
      alignItems: 'center', justifyContent: 'center',
    },
    placeholderGlyph: { fontSize: 15, fontFamily: FontFamily.bold, color: C.disabledInk },
    cancelPill: {
      minHeight: 44, borderRadius: Radii.pill, paddingHorizontal: 15, justifyContent: 'center',
      borderWidth: 1, borderColor: C.line2,
    },
    cancelPillBusy: { borderColor: C.line, opacity: 0.6 },
    cancelText: { fontSize: 12.5, fontFamily: FontFamily.bold, color: C.ink2 },
  });
}
