import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { Radii, Spacing, AppColors, FontFamily } from '../config/theme';
import { useScreenCommons } from '../hooks/useScreenCommons';

export type PlanId = 'monthly' | 'yearly' | 'lifetime';

export interface PaywallScreenProps {
  onClose?: () => void;
  onRestore?: () => void;
  onSubscribe?: (plan: PlanId) => void;
}

interface Plan {
  id: PlanId;
  label: string;
  price: string;
  per: string;
  meta?: string;
  badge?: string;
  save?: string;
  cta: string;
}

// Prices mirror the VN localized pricing strategy. Move to i18n / RevenueCat
// offerings when wiring real billing.
const PLANS: Plan[] = [
  { id: 'monthly', label: 'Tháng', price: '49.000đ', per: '/ tháng', cta: 'Bắt đầu gói tháng' },
  {
    id: 'yearly', label: 'Năm', price: '249.000đ', per: '/ năm',
    meta: '~20.750đ / tháng', badge: 'PHỔ BIẾN', save: '−58%',
    cta: 'Dùng thử 7 ngày miễn phí',
  },
  { id: 'lifetime', label: 'Trọn đời', price: '599.000đ', per: 'một lần', cta: 'Mở khoá trọn đời' },
];

function RingMark({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" accessible={false}>
      <Path d="M115.5,52 A56,56 0 1 1 84.5,52" fill="none" stroke={color} strokeWidth={26} strokeLinecap="round" />
      <Path d="M74,104 L94,124 L128,84" fill="none" stroke={color} strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function AnalyticsArt({ color }: { color: string }) {
  return (
    <Svg width={62} height={44} viewBox="0 0 124 88" accessible={false}>
      <Rect x={10} y={52} width={18} height={30} rx={5} fill={color} fillOpacity={0.35} />
      <Rect x={38} y={38} width={18} height={44} rx={5} fill={color} fillOpacity={0.55} />
      <Rect x={66} y={24} width={18} height={58} rx={5} fill={color} fillOpacity={0.8} />
      <Rect x={94} y={10} width={18} height={72} rx={5} fill={color} />
    </Svg>
  );
}

function RankArt({ color, gold }: { color: string; gold: string }) {
  return (
    <Svg width={62} height={44} viewBox="0 0 124 88" accessible={false}>
      <Path d="M62,8 l7,15 16,2 -12,11 3,16 -14,-8 -14,8 3,-16 -12,-11 16,-2 Z" fill={gold} />
      <Rect x={30} y={60} width={20} height={22} rx={4} fill={color} fillOpacity={0.45} />
      <Rect x={52} y={50} width={20} height={32} rx={4} fill={color} />
      <Rect x={74} y={66} width={20} height={16} rx={4} fill={color} fillOpacity={0.65} />
    </Svg>
  );
}

export default function PaywallScreen({ onClose, onRestore, onSubscribe }: PaywallScreenProps) {
  const { colors: C, styles } = useScreenCommons(makeStyles);
  const [selected, setSelected] = useState<PlanId>('yearly');
  const current = PLANS.find((p) => p.id === selected) ?? PLANS[1];
  const store = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Đóng" accessibilityRole="button" activeOpacity={0.7}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
          <View style={styles.proBadge}>
            <RingMark color={C.primary} size={15} />
            <Text style={styles.proText}>PRO</Text>
          </View>
          <View style={{ width: 20 }} />
        </View>

        <Text style={styles.h1}>Mở khoá Pro 🔓</Text>
        <Text style={styles.sub}>Soi tiến bộ · Leo top</Text>

        <View style={styles.tiles}>
          <View style={styles.tile}>
            <AnalyticsArt color={C.primary} />
            <Text style={styles.tileTitle}>Analytics</Text>
            <Text style={styles.tileDesc}>Biểu đồ & lịch sử đầy đủ</Text>
          </View>
          <View style={styles.tile}>
            <RankArt color={C.primary} gold={C.starGold} />
            <Text style={styles.tileTitle}>Đua top</Text>
            <Text style={styles.tileDesc}>Bạn đang top mấy %?</Text>
          </View>
        </View>

        {PLANS.map((p) => {
          const sel = p.id === selected;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => setSelected(p.id)}
              style={[styles.price, sel && styles.priceSel]}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ checked: sel }}
              accessibilityLabel={`${p.label} ${p.price} ${p.per}`}
            >
              {p.badge ? (
                <View style={styles.pop}>
                  <Text style={styles.popText}>{p.badge}</Text>
                </View>
              ) : null}
              <View style={styles.priceLeft}>
                <View style={styles.lblRow}>
                  <Text style={styles.lbl}>{p.label}</Text>
                  {p.save ? (
                    <View style={styles.save}>
                      <Text style={styles.saveText}>{p.save}</Text>
                    </View>
                  ) : null}
                </View>
                {p.meta ? <Text style={styles.meta}>{p.meta}</Text> : null}
              </View>
              <View style={styles.priceRight}>
                <Text style={styles.priceVal}>{p.price}</Text>
                <Text style={styles.per}>{p.per}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={styles.cta}
          onPress={() => onSubscribe?.(selected)}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={current.cta}
        >
          <Text style={styles.ctaText}>{current.cta}</Text>
        </TouchableOpacity>

        <View style={styles.fineRow}>
          <Text style={styles.fine}>Thanh toán qua {store} · huỷ bất cứ lúc nào · </Text>
          <TouchableOpacity onPress={onRestore} accessibilityRole="button" accessibilityLabel="Khôi phục mua hàng" activeOpacity={0.7}>
            <Text style={[styles.fine, styles.link]}>Khôi phục</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgBase },
    scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
    topBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingTop: Spacing.sm, paddingBottom: Spacing.xs,
    },
    close: { fontSize: 18, color: C.muted, fontFamily: FontFamily.semiBold },
    proBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    proText: { fontSize: 12, fontFamily: FontFamily.bold, color: C.primaryPress, letterSpacing: 0.5 },
    h1: { fontSize: 25, fontFamily: FontFamily.extraBold, letterSpacing: -0.5, color: C.inkDark, textAlign: 'center', marginTop: Spacing.xs },
    sub: { fontSize: 13, fontFamily: FontFamily.regular, lineHeight: 18, color: C.ink2, textAlign: 'center', marginTop: 2, marginBottom: Spacing.md },
    tiles: { flexDirection: 'row', gap: 12, marginBottom: Spacing.md },
    tile: {
      flex: 1, backgroundColor: C.primarySoft, borderRadius: Radii.lg,
      paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center',
    },
    tileTitle: { fontSize: 15, fontFamily: FontFamily.bold, color: C.inkDark, marginTop: 8 },
    tileDesc: { fontSize: 11.5, color: C.ink2, marginTop: 1, textAlign: 'center' },
    price: {
      borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.surface,
      borderRadius: Radii.md, paddingVertical: 13, paddingHorizontal: 15,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 9,
    },
    priceSel: { borderWidth: 2, borderColor: C.primary, backgroundColor: C.primarySoft },
    priceLeft: { flexShrink: 1 },
    lblRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    lbl: { fontSize: 14, fontFamily: FontFamily.bold, color: C.inkDark },
    meta: { fontSize: 11, color: C.muted, marginTop: 1 },
    priceRight: { alignItems: 'flex-end' },
    priceVal: { fontSize: 16, fontFamily: FontFamily.bold, color: C.inkDark },
    per: { fontSize: 11, color: C.muted },
    pop: {
      position: 'absolute', top: -9, left: 15, backgroundColor: C.primary,
      borderRadius: Radii.pill, paddingHorizontal: 9, paddingVertical: 2,
    },
    popText: { fontSize: 11, fontFamily: FontFamily.bold, color: C.white, letterSpacing: 0.3 },
    save: { backgroundColor: C.starSoft, borderRadius: Radii.pill, paddingHorizontal: 7, paddingVertical: 1 },
    saveText: { fontSize: 11, fontFamily: FontFamily.bold, color: C.starGold },
    cta: {
      backgroundColor: C.primary, borderRadius: Radii.md, paddingVertical: 16,
      alignItems: 'center', marginTop: Spacing.md,
    },
    ctaText: { fontSize: 16, fontFamily: FontFamily.bold, color: C.white },
    fineRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
    fine: { fontSize: 11, color: C.ink2 },
    link: { color: C.ink2, textDecorationLine: 'underline' },
  });
}
