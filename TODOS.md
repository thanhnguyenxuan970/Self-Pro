# TODOS

## Open

### Wire PaywallScreen into navigation
`src/screens/PaywallScreen.tsx` exists and is polished (TouchableOpacity, a11y labels, CTA guard) but is not registered in `RootNavigator.tsx`. Needs: register the screen in the auth stack, decide trigger condition (free-trial expiry? specific SKU?), wire `onSubscribe`/`onRestore`/`onClose` callbacks to a subscription hook.

### Visually verify Challenge feature on a working emulator/device
The 7/21/30/66-day Challenge feature (ChallengeHub/CreateChallenge/ChallengeDetail) shipped with `tsc`/`jest` green but was never visually verified — the dev AVD used this session has no network egress at all (`ping 8.8.8.8` → unreachable, confirmed at the app OkHttp layer too), so Metro could never deliver a bundle to it under any hostname. Needs a real device or a properly networked emulator to confirm layout, the day-grid cell colors, and the share-card capture actually render as intended.

---

## Completed

### Challenge feature — 7/21/30/66-day habit challenges (2026-07-03)
New `challenges` + `challenge_log` SQLite tables (migration v10, partial unique index enforces one active challenge), pure logic in `src/lib/challenge.ts` (ICT-pinned date math, lazy rollover — no midnight timer exists in this app so gaps are filled on next foreground), `useChallenge.ts` TanStack Query hooks, ChallengeHub/CreateChallenge/ChallengeDetail screens reachable from a new TodayScreen entry card, share via existing `react-native-view-shot`/`expo-image-picker`. Reviewed via `/autoplan` (codex unavailable, single Claude voice + one independent eng subagent) — corrected the original spec's assumptions about a client-side store and a `components/core` library that don't exist in this codebase. 14 new unit tests, 187/187 suite green, `tsc` clean. Not visually verified this session — see Open items.

### Design review + impeccable audit fixes (2026-07-03)
Emulator-based design review (hero rank chip cryptic "—" for no-rank state → reuses
`t.noRankTitle`) + code-level impeccable audit (ProgressScreen segment shadow duplicated
`Shadows.light` instead of using the token; SubActivitySheet/SuggestActivitySheet chips
and buttons missing `accessibilityRole`, SubActivitySheet still on the pre-fix tinted
backdrop `rgba(8,16,11,0.45)`; AddActivitySheet open/close transition was the one custom
`Animated` sheet in the app not gated on `useReduceMotion`). Commits: `6b7f165`, `8fe3022`,
`8975886`, `7f8d9fe`.

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
