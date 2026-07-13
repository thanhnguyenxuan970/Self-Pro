import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Radii, Spacing, AppColors, FontFamily } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRankConfigByTierOrder } from '../config/ranks.config';
import { BOTTOM_TAB_BAR_HEIGHT } from '../config/layout';

interface RankTier {
  id: number;
  tier_order: number;
  rank_name: string;
  stars_required: number;
}

interface Props {
  visible: boolean;
  tiers: RankTier[];
  currentTierId: number | null;
  onClose: () => void;
}

export function RankInfoSheet({ visible, tiers, currentTierId, onClose }: Props) {
  const { colors: C } = useTheme();
  const t = useTranslations();
  const { bottom } = useSafeAreaInsets();
  const styles = makeStyles(C, bottom);
  const sorted = [...tiers].sort((a, b) => a.tier_order - b.tier_order);
  const points: { e: string; t: string; s: string }[] = [
    { e: '⭐', t: t.rankInfoPoint1Title, s: t.rankInfoPoint1Sub },
    { e: '📈', t: t.rankInfoPoint2Title, s: t.rankInfoPoint2Sub(sorted.length) },
    { e: '♻️', t: t.rankInfoPoint3Title, s: t.rankInfoPoint3Sub },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grip} />
          <View style={styles.head}>
            <Text style={styles.title}>{t.rankInfoTitle}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={13} accessibilityRole="button" accessibilityLabel={t.close}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {points.map((p) => (
              <View key={p.t} style={styles.pt}>
                <Text style={styles.ptEmoji}>{p.e}</Text>
                <View style={styles.flex1}>
                  <Text style={styles.ptTitle}>{p.t}</Text>
                  <Text style={styles.ptSub}>{p.s}</Text>
                </View>
              </View>
            ))}

            <Text style={styles.sec}>{t.rankInfoTiersHeading(sorted.length)}</Text>
            {sorted.map((tier) => {
              const cur = tier.id === currentTierId;
              const cfg = getRankConfigByTierOrder(tier.tier_order);
              const rankLabel = t.rankNameMap[cfg.name] ?? cfg.name;
              const rankAltLabel = rankLabel === cfg.nameVi ? cfg.name : cfg.nameVi;
              const locked = tier.tier_order === 9 && !cur;
              const lockedLabel = rankLabel === cfg.name ? '??? · hidden' : '??? · còn giấu';
              return (
                <View key={tier.id} style={[styles.lrow, cur && styles.lrowCur]}>
                  <View style={[styles.lnum, cur && styles.lnumCur]}>
                    <Text style={[styles.lnumText, cur && styles.lnumTextCur]}>{tier.tier_order}</Text>
                  </View>
                  <View style={styles.lcopy}>
                    <Text style={styles.lname} numberOfLines={1}>{locked ? lockedLabel : rankLabel}</Text>
                    {!locked && <Text style={styles.lnameVi} numberOfLines={1}>{rankAltLabel}</Text>}
                  </View>
                  {cur ? (
                    <View style={styles.youtag}>
                      <Text style={styles.youtagText}>{t.leaderboardYou}</Text>
                    </View>
                  ) : null}
                  {!locked && <Text style={styles.lstar}>{tier.stars_required} ⭐</Text>}
                </View>
              );
            })}
            <View style={{ height: Spacing.sm }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(C: AppColors, bottomInset: number) {
  return StyleSheet.create({
    wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: { backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: Spacing.lg, paddingBottom: Spacing.md + BOTTOM_TAB_BAR_HEIGHT + bottomInset, maxHeight: '86%' },
    grip: { width: 38, height: 4, borderRadius: 2, backgroundColor: C.line2, alignSelf: 'center', marginBottom: 12 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    title: { fontSize: 18, fontFamily: FontFamily.bold, color: C.inkDark },
    close: { fontSize: 17, color: C.muted, fontFamily: FontFamily.bold },
    flex1: { flex: 1 },
    pt: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: C.surface2, borderRadius: Radii.md, padding: 12, marginBottom: 8 },
    ptEmoji: { fontSize: 18 },
    ptTitle: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.inkDark },
    ptSub: { fontSize: 11.5, fontFamily: FontFamily.regular, color: C.ink2, marginTop: 1 },
    sec: { fontSize: 12, fontFamily: FontFamily.semiBold, color: C.ink2, marginTop: 10, marginBottom: 8 },
    lrow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 7 },
    lrowCur: { borderWidth: 2, borderColor: C.primary, backgroundColor: C.primarySoft },
    lnum: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.surface3, alignItems: 'center', justifyContent: 'center' },
    lnumCur: { backgroundColor: C.primary },
    lnumText: { fontSize: 11, fontFamily: FontFamily.bold, color: C.ink2 },
    lnumTextCur: { color: C.white },
    lcopy: { flex: 1, minWidth: 0 },
    lname: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.inkDark },
    lnameVi: { fontSize: 11.5, fontFamily: FontFamily.regular, color: C.ink2, marginTop: 1 },
    lstar: { fontSize: 12.5, fontFamily: FontFamily.semiBold, color: C.ink2 },
    youtag: { backgroundColor: C.primary, borderRadius: Radii.pill, paddingHorizontal: 6, paddingVertical: 1, marginRight: 6 },
    youtagText: { fontSize: 11, fontFamily: FontFamily.bold, color: C.white, textTransform: 'uppercase' },
  });
}
