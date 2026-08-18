import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { AppLanguage } from '../../config/i18n';
import { AppColors, FontFamily, Radii } from '../../config/theme';
import type { FriendLadderRow } from '../../lib/friends';
import { formatStarCount } from '../../lib/friends';
import { InitialsAvatar } from './InitialsAvatar';
import { OverflowMenu } from './OverflowMenu';

export type FriendRowCopy = {
  youChip: string;
  removeMenuItem: string;
  blockMenuItemShort: string;
  overflowAria: string;
  dismissLabel: string;
  streakLine: (days: number) => string;
  lifetimeLine: (stars: number) => string;
};

type Props = {
  row: FriendLadderRow;
  isLast: boolean;
  playerLabel: string;
  lang: AppLanguage;
  colors: AppColors;
  copy: FriendRowCopy;
  onRemove: (relationshipId: string, displayName: string) => void;
  onBlock: (relationshipId: string, displayName: string) => void;
};

/**
 * One race-ladder row: rank numeral (repeats across a tie), avatar, name
 * (+YOU chip for self), streak (omitted at 0), lifetime stars. Tied rows
 * carry a decorative 3px rail on the card gutter that never shifts layout —
 * an absolutely-positioned overlay, mirroring the board's `inset box-shadow`
 * rather than a real border that would nudge tied rows' content sideways.
 */
export const FriendRow = React.memo(function FriendRow({ row, isLast, playerLabel, lang, colors, copy, onRemove, onBlock }: Props) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tied = row.tiedCount > 1;
  const starsLabel = `${formatStarCount(row.lifetimeStars, lang)} ★`;
  const a11yLabel = [
    `#${row.friendRank}`,
    `${row.displayName}${row.isCurrentUser ? ` (${copy.youChip})` : ''}`,
    copy.lifetimeLine(row.lifetimeStars),
    row.effectiveStreak > 0 ? copy.streakLine(row.effectiveStreak) : null,
  ].filter(Boolean).join(', ');

  return (
    <View style={[styles.row, !isLast && styles.rowBorder]}>
      {tied && <View style={styles.tieRail} importantForAccessibility="no" />}
      {/* A ladder row is one screen-reader stop, not four — but the overflow
          button below must stay a SIBLING of this accessible group, not a
          descendant, or an `accessible` ancestor swallows it into silence
          (the exact bug already fixed once in TaskRow.tsx). */}
      <View style={styles.infoGroup} accessible accessibilityLabel={a11yLabel}>
        <Text style={styles.rank} numberOfLines={1}>#{row.friendRank}</Text>
        <InitialsAvatar name={row.displayName} playerId={row.playerId} fallbackLabel={playerLabel} colors={colors} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{row.displayName}</Text>
            {row.isCurrentUser && (
              <View style={styles.youChip}><Text style={styles.youChipText}>{copy.youChip}</Text></View>
            )}
          </View>
          {row.effectiveStreak > 0 && <Text style={styles.streak} numberOfLines={1}>{copy.streakLine(row.effectiveStreak)}</Text>}
        </View>
        <Text style={styles.stars} numberOfLines={1}>{starsLabel}</Text>
      </View>
      {!row.isCurrentUser && (
        <OverflowMenu
          ariaLabel={copy.overflowAria}
          dismissLabel={copy.dismissLabel}
          colors={colors}
          items={[
            { label: copy.removeMenuItem, onPress: () => onRemove(row.relationshipId ?? '', row.displayName) },
            { label: copy.blockMenuItemShort, danger: true, onPress: () => onBlock(row.relationshipId ?? '', row.displayName) },
          ]}
        />
      )}
    </View>
  );
});

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 10, borderColor: C.line,
      position: 'relative',
    },
    rowBorder: { borderBottomWidth: 1 },
    tieRail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.primarySoft },
    infoGroup: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
    rank: { minWidth: 34, fontSize: 19, fontFamily: FontFamily.extraBold, letterSpacing: -0.6, color: C.muted, textAlign: 'right' },
    info: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { flexShrink: 1, fontSize: 15, fontFamily: FontFamily.bold, color: C.inkDark },
    youChip: { backgroundColor: C.primary, borderRadius: Radii.pill, paddingHorizontal: 6, paddingVertical: 2 },
    youChipText: { fontSize: 11, fontFamily: FontFamily.extraBold, letterSpacing: 0.3, color: C.onAccent },
    streak: { fontSize: 12, fontFamily: FontFamily.semiBold, color: C.muted, marginTop: 2 },
    stars: { fontSize: 15, fontFamily: FontFamily.extraBold, color: C.starGoldText },
  });
}
