# TODOS

## Open

### Wire PaywallScreen into navigation
`src/screens/PaywallScreen.tsx` exists and is polished (TouchableOpacity, a11y labels, CTA guard) but is not registered in `RootNavigator.tsx`. Needs: register the screen in the auth stack, decide trigger condition (free-trial expiry? specific SKU?), wire `onSubscribe`/`onRestore`/`onClose` callbacks to a subscription hook.

---

## Completed

### Accessibility & i18n audit fixes (v1.0.49, 2026-07-02)
15-finding adversarial audit pass: radio group roles, animation cleanup (LevelUpCelebrationModal timeout ref, OnboardingScreen anim stop), contrast upgrades, touch target enlargements, ShareCardModal color token migration, i18n keys for SignIn + CalDOW, placeholder contrast fixes.



### Backfill check-in system (điểm danh bù)
Shipped in v0.1.0.0 (2026-06-25). Pure function guardrails, DB write layer, Calendar UI with BackfillSheet, streak recompute chain.

### Habi rebrand + Be Vietnam Pro typography
Shipped in v0.1.0.0 (2026-06-25). Full Vietnamese glyph coverage, mixed-metrics "random bolding" eliminated.

### WCAG AA accessibility pass
Shipped in v0.1.0.0 (2026-06-25). 12+ screens — contrast, roles, labels, reduceMotion gating.

### Rank system simplification
Shipped in v0.1.0.0 (2026-06-25). Removed VND rewards, demotion floor; 1-tier-per-week cap preserved.
