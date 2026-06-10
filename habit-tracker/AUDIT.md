# Codebase Audit — Habit ring (`Self-Pro/habit-tracker`)

**Scope:** bugs · compilation · dependency conflicts · logic flaws · performance · security · best practices.
**Method:** `tsc --noEmit`, `jest`, dependency review, static scan, manual review of auth/sync/DB/game logic.
**Baseline (verified):** `tsc --noEmit` → **0 errors** · `jest` → **90/90 passing (13 suites)**.

Severity: **Critical** = act before next release · **High** = fix soon · **Medium** = should fix · **Low** = polish.
Status: ✅ Fixed this pass · 🔧 Recommended (left for you) · 🔎 Verify.

---

## Summary table

| ID | Sev | Area | Finding | Status |
|----|-----|------|---------|--------|
| C1 | Critical | Security | Release keystore password committed to a **public** repo | ✅ redacted (history scrub + rotate needed) |
| H1 | High | Correctness/Privacy | Supabase sync uploaded **other accounts' rows** under current email | ✅ Fixed |
| H2 | High | Security | RLS policies are manual — confirm they're applied on live Supabase | 🔎 Verify |
| M1 | Medium | Performance | No indexes on `activity_log` (hottest, ever-growing table) | ✅ Fixed |
| M2 | Medium | Logic/balance | A single BAD-habit log subtracts **−50★** | 🔧 Recommended |
| M3 | Medium | Security/identity | Account identity keyed on mutable **email**, not Google `sub` | 🔧 Recommended |
| M4 | Medium | Dependencies | Unused dependency `expo-auth-session` | ✅ Removed |
| M5 | Medium | Logic | Streak sync uses `update()` on a row nothing inserts → silent no-op | 🔧 Recommended (1-line) |
| L1 | Low | Best practice | Monolithic migration runner, no version tracking | 🔧 |
| L2 | Low | Best practice | `treats`/`treat_history` `id` without `AUTOINCREMENT` | 🔧 |
| L3 | Low | Best practice | `console.warn` in production paths (8) not gated by `__DEV__` | 🔧 |
| L4 | Low | Best practice | `as any` in Animated styles | 🔧 |
| L5 | Low | Resilience | DB-init errors swallowed (no error UI) | 🔧 |

---

## Critical

### C1 — Keystore signing password in a public repo
`CLAUDE.md:150` contained `password: HabitR1ng#2026` for `habitring-release.keystore`. The git remote is the **public** `github.com/thanhnguyenxuan970/Self-Pro`, and the value is in committed history (commit `efcea2b`).
- The `.keystore` file itself was **never committed** (verified) and is correctly gitignored, so exploitability is limited (an attacker needs the key file too) — but a signing password in public history must be treated as **compromised**.
- ✅ **Done:** redacted the value in `CLAUDE.md` (working copy).
- 🔧 **You must:** (1) change the keystore password (`keytool -storepasswd -keystore habitring-release.keystore`); (2) scrub git history (`git filter-repo` or BFG) and force-push, or make the repo private; (3) never commit the password again — keep it in `android/keystore.properties` (already gitignored) or a secret manager. SHA fingerprints in `CLAUDE.md` are public info and fine.

---

## High

### H1 — Cross-account data leak in Supabase sync ✅ Fixed
`src/api/syncService.ts` — `syncActivity`/`syncFund` selected `WHERE id > <cursor>` with **no `user_id` filter**, using a single global cursor. `resolveUserRow` (in `useAuth.ts`) can create multiple local user rows on one device, so `activity_log` may hold rows for several accounts. The sync pushed **every** row above the cursor tagged with the **currently** signed-in email — i.e. account A's data uploaded as account B's. RLS does **not** catch this (rows are tagged with the authenticated email, so `WITH CHECK` passes).
- **Fix applied:** added `resolveUserId(email)`, filtered both queries by `user_id`, and made cursors **per-user** (`...:<userId>`); `resetSyncCursors` now clears all per-user keys. Verified `tsc`/`jest` green.

### H2 — Confirm RLS is live 🔎 Verify
`supabase/migrations/001_enable_rls.sql` / `002_create_users_table.sql` are correct (`USING (user_email = auth.email())`), but they're applied **manually** ("run in SQL Editor"). The anon key ships in the client bundle (by design), so if RLS/policies are **not** actually enabled on the live project, any user could read/write/delete every table.
- 🔧 Verify in the Supabase dashboard that RLS is ON and the `own rows only` policies exist on `activity_log`, `fund_transactions`, `users`. Also apply the currently-commented hardening (`REVOKE ALL … FROM anon; GRANT … TO authenticated;`, lines 34–38).

---

## Medium

### M1 — Missing indexes on hot tables ✅ Fixed
`activity_log` (largest table, grows every log) and `fund_transactions` had no supporting indexes, yet are filtered by `(user_id, local_date)`, `(user_id, week_start)`, and `(user_id, task_type_id, local_date)` across Today/Calendar/Progress. Full scans grow with history.
- **Fix applied** in `src/db/migrations.ts`: `idx_activity_user_date`, `idx_activity_user_week`, `idx_activity_user_task_date`, `idx_fund_user` (idempotent `CREATE INDEX IF NOT EXISTS`).

### M2 — BAD-habit penalty is enormous 🔧
`src/config/constants.ts:6` `DEFAULT_PENALTY_STARS = 50`; `src/game/logTask.ts:60` sets `starsDelta = -starPenalty`. One BAD-habit log subtracts **50★**, while a GOOD task gives **+1★** and rank tiers require 5–320★ — a single tap can erase weeks of progress / an entire rank. Looks like a units mix-up (a *points* penalty applied as *stars*). Gated today only because shipped templates use `starPenalty: 0` and no BAD-kind templates exist, but any user-created BAD habit triggers it.
- 🔧 Decide intended balance (e.g. penalty in points, or a small star value like 1–3); don't ship −50★ as the default.

### M3 — Identity keyed on email, not stable `sub` 🔧
`src/hooks/useAuth.ts:101` — the `google_sub` column actually stores the **email**. Emails can change or be reassigned, which breaks identity/sync continuity and could, in the worst case, associate a recycled email with a prior owner's data.
- 🔧 Store the OIDC `sub` (subject id from the Google `idToken`) as the stable key; keep email as a display attribute.

### M4 — Unused dependency `expo-auth-session` ✅ Removed
No imports anywhere in `src/` (the auth path moved to `@react-native-google-signin`). Removed from `package.json`.
- 🔧 Run `npm install` to update `package-lock.json`.

### M5 — Streak sync silently does nothing 🔧 (1-line)
`src/api/syncService.ts` `syncUserStreak` uses `.update().eq('user_email', …)`, but nothing inserts the Supabase `users` row, so the update matches **0 rows** and cross-device streak restore never works (no error surfaced).
- 🔧 Change to upsert: `await supabase.from('users').upsert({ user_email: userEmail, current_streak: currentStreak }, { onConflict: 'user_email' })`. (`users.user_email` is already `UNIQUE`.)

---

## Low / best practice

- **L1** `src/db/migrations.ts` — one monolithic idempotent function re-runs every launch; no `PRAGMA user_version` gating. Works now; move to a versioned runner before it grows further.
- **L2** `src/db/migrations.ts:206,223` — `treats`/`treat_history` use `id INTEGER PRIMARY KEY` (no `AUTOINCREMENT`); rowids can be reused after deletes. Low risk unless these get synced by id later.
- **L3** 8 `console.warn` in `syncService.ts` / `useAuth.ts` / `SettingsContext.tsx` — gate behind `__DEV__` or a logger to keep production device logs clean.
- **L4** `as any` in `src/components/RankMascot.tsx:128-132` and `src/screens/RankScreen.tsx:165,202` — Animated typing escape hatches; acceptable, can be typed with `Animated.AnimatedInterpolation`.
- **L5** `App.tsx` DB init uses `init().catch(console.error)` — a failed migration leaves the app on a blank/loading screen with no feedback. Add an error state + retry (or an error boundary).
- **L6** `src/hooks/useAuth.ts:219` `DELETE FROM ${table}` interpolates a table name — safe because `table` comes from a hardcoded allowlist. Keep it hardcoded; never derive from input.

---

## What's healthy (don't change)
- `tsc` strict mode is clean; 90/90 tests pass.
- All runtime SQL in `src/queries/**` is parameterized (no injection).
- RLS policies are correctly authored (keyed on `auth.email()`).
- Only `EXPO_PUBLIC_*` values in `.env.local` (anon key + OAuth client IDs are client-public by design); `.env.local` is gitignored; no server secrets in the client.

## Dependencies / compatibility
- All `expo-*` pinned to `~56` (consistent); `victory-native ^36` intentionally pinned (avoids Skia); `react 19.2.3` / `react-native 0.85.3`. No obvious peer conflicts.
- `typescript ~6.0.3` is an unusual line — confirm it's intended (vs 5.x). It compiled clean here.
- Run `npx expo-doctor` in a networked environment to validate native-module alignment (not runnable in this sandbox).

## Fixes applied this pass (verified `tsc` 0 errors, `jest` 90/90)
1. `CLAUDE.md` — redacted keystore password (C1).
2. `src/api/syncService.ts` — per-user sync scoping + cursors (H1).
3. `src/db/migrations.ts` — added activity_log / fund_transactions indexes (M1).
4. `package.json` — removed `expo-auth-session` (M4).
