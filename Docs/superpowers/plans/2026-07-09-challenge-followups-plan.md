# Linked-Challenge Follow-ups + Crash Reporting

Closes the four items deferred from the 2026-07-08 challenge-system gap work
(`TODOS.md` → "Linked-completion follow-ups" and "Add crash-reporting/analytics
infrastructure"). Backend derivation for linked challenges already shipped in
`challengeLinked.ts`/`useChallenge.ts` (migration v17 added `min_duration`/
`min_count` columns, accepted by `useCreateChallenge`/`useRestartChallenge`).
Nothing here touches that derivation logic — this plan wires up the missing
UI, hardens one input to it, and adds the first crash-reporting hook in the app.

**Provenance note:** items 1-3 below already went through a full `/plan-ceo-review`
on 2026-07-08 (`~/.gstack/projects/thanhnguyenxuan970-Self-Pro/ceo-plans/2026-07-08-challenge-system-gap.md`,
tasks T6, T8, T9) — that review's acceptance criteria, error/rescue registry
entries (rows 3A, 11A, and the `logged_at` clock-rollback row), and diagrams
are authoritative and reproduced/adapted below rather than re-derived. Item 4
(crash reporting) was explicitly ruled **NOT in scope** by that same review
("bigger decision than this PR") — it is the one genuinely new decision in
this plan and the one this pass's CEO review should focus its scrutiny on.

---

## 1 · Threshold-input UI on `CreateChallengeScreen`

**Gap:** `useCreateChallenge` accepts `minDuration`/`minCount` (clamped via
`clampThreshold`, `>= 1` or `null`) but no UI sets them — every linked
challenge today is threshold-less (`min_duration`/`min_count` stay `null`,
so any log on the linked task type counts, regardless of length or count).

**Scope:** Only surfaces when `taskTypeId !== null` (a habit is picked) —
threshold fields are meaningless for `taskTypeId === null` (no linked source).

**UI (inserted after the habit-picker row, before the mode picker):**
- A collapsed-by-default "Ngưỡng hoàn thành" (completion threshold) section,
  shown only when a habit chip is selected. Two optional inputs:
  - **Số phút tối thiểu / lần** (min duration) — numeric chip row reusing the
    existing `durChip` pattern: `Bất kỳ` (null) / `15` / `30` / `45` / `60`.
  - **Số lần / ngày** (min count) — same chip pattern: `Bất kỳ` (null) / `1` / `2` / `3`.
- Both default to `Bất kỳ` (`null`) — this preserves current threshold-less
  behavior for anyone who doesn't touch the section, so it's non-breaking.
- Selected values pass straight into `createChallenge.mutateAsync({ ..., minDuration, minCount })`;
  `clampThreshold` already guards server-side, no client-side re-validation needed.
- i18n: 4 new keys (`challengeThresholdLabel`, `challengeThresholdDurationLabel`,
  `challengeThresholdCountLabel`, `challengeThresholdAny`) in `i18n.ts`, VI text
  primary per existing convention.

**Out of scope:** no threshold editing after creation (matches the rest of
`CreateChallengeScreen` — mode/duration are also create-time-only today).

---

## 2 · Linked-challenge hint + "Ghi ngay" CTA on `ChallengeDetailScreen`

**Gap:** For a linked challenge, the existing "Log today" button
(`handleLogToday` → `useLogChallengeDay` → `logActiveChallengeDay`) does not
write a completion — it only recomputes `streak_current` from
`getDoneDates()`, which reads `activity_log` (confirmed: `useChallenge.ts:271-292`).
Pressing it does nothing if the user hasn't already logged the linked habit
today. There is currently no affordance telling the user this, so a linked
challenge that stays un-checked reads as broken.

**Fix — replace the generic log button with a linked-aware variant when
`challenge.taskTypeId != null`:**
- Hint row above the button (shown always for a linked, active challenge):
  `t.challengeLinkedHint(taskName)` → "Thử thách này tự hoàn thành khi bạn
  ghi '{taskName}'" (task name resolved via the same `useTodayTasks` list
  already fetched on `CreateChallengeScreen`; `ChallengeDetailScreen` needs
  its own `useTodayTasks(userId)` call to resolve `challenge.taskTypeId` → name).
  If `min_duration`/`min_count` are set, append the threshold: "(tối thiểu N phút / M lần)".
- CTA label changes to `t.challengeLogNowCta` ("Ghi ngay") when linked and
  not yet logged today (`!challenge.loggedToday`); tapping it opens the
  existing global `AddActivitySheet` instead of calling `logDay.mutateAsync()`
  directly (which would be a no-op call today, per the gap above).
- **Navigation mechanics:** `AddActivitySheet` is currently mounted once in
  `RootNavigator` and toggled by local `fabVisible` state, with no external
  trigger. Add a minimal preset-open path: a new `useAddActivityIntent()`
  hook backed by a module-level event emitter (mirrors the existing
  `queryClient`-singleton pattern already used for cross-screen invalidation
  — no new dependency). `ChallengeDetailScreen`'s CTA calls
  `requestAddActivity({ taskTypeId })`; `RootNavigator` subscribes and opens
  `AddActivitySheet` with that preset. `AddActivitySheet` needs a new
  optional `presetTaskTypeId` prop that pre-selects the matching suggestion
  chip if present, falling back to today's normal open state if not (habit
  might not be in the current suggestion list).
- After a successful log via the sheet, no new invalidation wiring is
  needed: `useLogTask`'s mutation already runs
  `qc.invalidateQueries({ queryKey: ['challenge'] })` (`useToday.ts:418`),
  and `useChallengeById` keys on `['challenge', 'detail', userId, challengeId]`
  (`useChallenge.ts:524`) — TanStack Query matches by key prefix, so the
  detail screen's `loggedToday`/progress ring already refresh automatically.
  (Caught in outside-voice review: my first draft proposed adding redundant
  invalidation here — verified against the actual call sites and dropped.)
- If `challenge.loggedToday` is already true, keep today's existing
  "✓ Đã ghi hôm nay" disabled state — no behavior change there.

**CEO review decision (1A):** confirmed — the event-emitter cross-screen
trigger (`useAddActivityIntent()`) is the right weight here over a
toast-only fallback, since it actually pre-fills the correct habit instead
of just pointing the user at the FAB. It remains the one genuinely new piece
of plumbing in this plan; everything else is additive UI.

---

## 3 · Clock-rollback hardening

**Gap:** Linked-completion derivation (`getDoneDates`) and the daily rollover
trigger both trust `activity_log.local_date`/`logged_at` at face value. A
device with its clock rolled back (accidentally or deliberately) can log an
activity that gets attributed to a past `local_date`, retroactively marking a
linked-challenge day "done" or resurrecting a lapsed streak after the fact.

**Fix — conforms to the already-approved 2026-07-08 spec (T6): anchor to
Supabase's server-assigned insert time, not a local device cursor** (a local
cursor resets to "no protection" on reinstall or a second device — the CEO
review on this pass (2A) rejected a simplified local-cursor variant for
exactly that reason):
- `syncActivity()` (`syncService.ts:71`) pushes `activity_log` rows via
  `upsertBatch` (`syncService.ts:57-69`). **Outside-voice review caught that
  the original draft here was unimplementable:** `upsertBatch` calls
  `.upsert(...)` with no `.select()` chained, so PostgREST returns no row
  data — there is no server timestamp to compare against. Fix (CEO review
  decision): add `.select()` to the shared `upsertBatch` call. It's also
  used by `syncFund`; that call site simply ignores the extra returned data,
  no behavior change there, and no new network round-trip since upsert
  already talks to Supabase.
- On each push response, compare the row's client-supplied `logged_at`
  against the Supabase row's server-assigned insert timestamp now available
  in the response. If `logged_at` is implausibly earlier than the server
  insert time (tolerance: a few minutes, to allow legitimate offline-queued
  writes that sync later), flag the row (`is_clock_suspect` — new nullable
  column, migration vNext) instead of blocking the write outright — logging
  still succeeds offline-first, the tag just gates derivation.
- **Implementation-time verification required:** confirm the Supabase
  `activity_log` table actually has a server-default insert timestamp column
  (e.g. `created_at timestamptz default now()`) independent of the
  client-supplied `logged_at` column. This repo's checked-in Supabase
  migrations (`habit-tracker/supabase/migrations/`) do not include the
  `CREATE TABLE activity_log` statement (it predates the migrations folder),
  so this can't be confirmed by reading the repo — check the live Supabase
  dashboard schema first. If the column doesn't exist, add it via a new
  Supabase migration before this check can be wired up.
- `getDoneDates()` (`useChallenge.ts` — not `challengeLinked.ts`, corrected
  after outside-voice review; it calls `challengeLinked.ts`'s
  `deriveLinkedDoneDates` as a pure-logic helper) excludes rows where
  `is_clock_suspect = 1` from `deriveLinkedDoneDates`'s input set. Same
  filter applied to the rollover trigger's loggedDates set.
- **Known limitation, explicitly accepted (CEO review, post outside-voice):**
  this is a detection net, not a prevention system, in two distinct ways.
  (1) A device rolled back *before* its first-ever sync has no prior server
  round-trip to compare against and won't be caught. (2) More importantly —
  `logActiveChallengeDay` grants streak completion and calls
  `awardChallengeCompletion` (stars/rank) **synchronously, on-device, at
  log-time** (`useChallenge.ts:271-292`), before any async sync round-trip
  can flag the row. A clock-rollback that fabricates one completed day
  succeeds and is rewarded immediately; `is_clock_suspect` only prevents the
  exploit from being *repeated* (future `getDoneDates` reads exclude the
  flagged row from ongoing derivation) — it does not claw back a reward
  already granted. Full reward clawback (reverse `awardChallengeCompletion`
  via the existing delete-challenge reward-reversal mechanism when a flagged
  row is found to have triggered a completion) was considered and explicitly
  deferred — it's a materially larger change touching money-adjacent reward
  mechanics and belongs in its own review pass, not folded into this one.
  Matches this repo's already-stated "best-effort anti-cheat, not
  user-facing" posture for this exact check (2026-07-08 spec's Error &
  Rescue Registry) — now written down explicitly rather than left implicit.
- Test coverage: unit tests for the tagging predicate in isolation (clean
  ascending dates, a rolled-back row vs. server insert time, a legitimate
  offline-queued late-sync within tolerance) — no need to spin up a live
  Supabase round-trip for this; mock the server insert timestamp.

---

## 4 · Crash-reporting / analytics infrastructure

**Gap:** No Sentry/Bugsnag/equivalent SDK anywhere in the app (confirmed:
`package.json` has zero matches for `sentry`/`bugsnag`/`crash`). Production
errors are invisible until a user reports them — already bit the
daily-reminder-toggle `expo-notifications` Metro error (TODOS.md, 2026-07-08).

**Approach — `@sentry/react-native` (first-party Expo SDK 56 config-plugin
support, matches the plan's own suggestion, avoids the deprecated `sentry-expo`
wrapper):**
- `npx expo install @sentry/react-native`, add the config plugin to `app.json`'s
  `plugins` array.
- Read DSN from `process.env.EXPO_PUBLIC_SENTRY_DSN` (public-safe — Sentry DSNs
  are not secret, they're rate-limited per-project) with a **hard no-op guard**:
  if the env var is unset, `Sentry.init` is skipped entirely and the app runs
  exactly as it does today. This means the feature ships dark until whoever
  owns the Sentry account supplies a DSN — **that account/DSN does not exist
  yet and is outside what I can provision; flagging for the user to create
  one and drop it in `.env`** (or CI secrets for release builds).
- **CEO review decision (1B):** `Sentry.init(...)` call wrapped in try/catch
  at the `App.tsx` boot call site — a monitoring feature must never be able
  to crash the thing it's monitoring. If init throws, the app boots normally
  with crash reporting simply inactive for that session (matches this repo's
  established pattern of guarding non-critical side-effect calls, e.g. the
  notification-scheduling try/catch already in `useChallenge.ts`).
- Wire-up points: init in `App.tsx` before the root component mounts; wrap the
  root in `Sentry.wrap()`; add `Sentry.captureException` to the two existing
  unguarded-catch patterns AGENTS.md/TODOS.md already flagged (notification
  scheduling try/catch sites already exist and just need the capture call
  added, not new try/catch).
- No user PII beyond what Sentry captures by default (device/OS/app version) —
  `beforeSend` scrub for `email`/`google_sub` if they ever end up in a captured
  context, since `google-services.json`-adjacent identity data is explicitly
  sensitive per this repo's `AGENTS.md`.
- Source maps for release builds: `expo-router`/EAS handles this automatically
  via the config plugin for EAS builds; local Windows `bundleRelease` path
  needs a one-line note in `habit-tracker/AGENTS.md`'s Known Errors table if
  source-map upload needs a manual step (needs confirming against the actual
  Sentry dashboard once a project/DSN exists — can't verify without one).

**Explicitly deferred (not this pass):** breadcrumb-level analytics
(funnels, feature-usage counts) — this plan only covers crash/error
visibility, which is the P2 item TODOS.md actually asks for.

---

## Sequencing

1 and 2 touch overlapping files (`CreateChallengeScreen.tsx` uses
`useCreateChallenge`; `ChallengeDetailScreen.tsx` is independent) — no
ordering constraint between them. 3 is fully independent (sync layer). 4 is
independent but should land last since it's an `app.json`/native-config
change that benefits from a clean `tsc`/`jest` baseline before adding a new
native module. Suggested order: 1 → 2 → 3 → 4, each its own commit,
`tsc`+`jest` green before each commit (matches the pattern the 2026-07-09
"Completed" TODOS entry already used successfully under concurrent-session
pressure).

---

## NOT in scope
- Full reward clawback on clock-rollback detection (reverse awarded
  stars/rank when a flagged row is found to have triggered a completion) —
  materially larger, money-adjacent change; deferred to TODOS.md (P3).
- Breadcrumb-level analytics (funnels, feature-usage counts) — distinct from
  the crash/error visibility TODOS.md actually asked for; deferred to
  TODOS.md (P3).
- Threshold editing after challenge creation — matches existing
  create-time-only convention for mode/duration on `CreateChallengeScreen`.
- Group Challenge, News remote-config, scheduled share-card generation —
  already NOT in scope per the 2026-07-08 review, unaffected by this pass.

## What already exists (reused, not rebuilt)
- `clampThreshold`/`min_duration`/`min_count` columns and mutation wiring
  (`challengeLinked.ts`, `useChallenge.ts`, migration v17) — items 1-2 only
  add the UI on top of already-shipped backend.
- `idx_activity_user_task_date` index — already covers the clock-rollback
  check's query pattern, no new index needed.
- `queryClient` cross-screen invalidation pattern — `useAddActivityIntent()`
  mirrors it rather than introducing a new state-management dependency.
- Reward-reversal mechanism (built for delete-challenge) — identified as the
  reuse target *if* the deferred reward-clawback TODO is ever picked up.
- Notification-scheduling try/catch pattern (`useChallenge.ts`) — Sentry's
  init guard (1B) and `captureException` wiring follow the same shape.

## Dream state delta
```
CURRENT STATE                    THIS PLAN                       12-MONTH IDEAL
Linked challenges           --->  + Threshold UI            --->  Full linked-challenge
threshold-less,                   + Linked hint/CTA                journey: thresholds,
no manual-log affordance,         + Clock-rollback detection        clear affordances,
no rollback detection,             (best-effort, no clawback)       tamper-resistant
zero production error             + First crash-reporting hook      derivation, full
visibility                                                          production observability
```

## Error & Rescue Registry
| Method/Codepath | What Can Go Wrong | Rescued? | Rescue Action | User Sees |
|---|---|---|---|---|
| Threshold chip selection → `createChallenge.mutateAsync` | N/A — only pre-validated chip values reach the mutation | Y (by construction) | `clampThreshold` re-guards server-side regardless | Threshold behaves as selected |
| `requestAddActivity()` emitter call | No subscriber mounted (race on screen transition) | Y | No-op if no listener; sheet simply doesn't open, no crash | Nothing (edge case, extremely narrow window) |
| `AddActivitySheet` preset task not in current suggestion list | Habit not found in today's suggestions | Y | Falls back to normal open state (no preset) | User picks manually — no worse than today |
| `upsertBatch` `.select()` addition | Supabase upsert response malformed/empty | Y (unchanged) | Existing `if (error) throw error` still gates it; missing expected column just yields `undefined` timestamp | Row simply isn't tagged suspect this sync (fails safe — no false accusation) |
| Clock-rollback tagging | `activity_log` table lacks the assumed server timestamp column | N ← GAP (implementation-time) | Flagged explicitly as a pre-implementation verification step | N/A until verified |
| `Sentry.init()` at boot | Native module init throws | Y | try/catch (1B) — app boots normally, crash reporting inactive that session | Nothing (silent degrade) |
| `Sentry.captureException` calls | Sentry transport unavailable (offline) | Y (SDK-level) | Sentry SDK queues offline internally — no app-level handling needed | Nothing |
| Clock-rollback exploit (fabricated completion) | Reward already granted before flag arrives | Partial (documented gap) | `is_clock_suspect` stops repeat abuse only; no clawback (deferred TODO) | User keeps the one fabricated reward — known, accepted limitation |

## Failure Modes Registry
| Codepath | Failure Mode | Rescued? | Test? | User Sees? | Logged? |
|---|---|---|---|---|---|
| Threshold UI → mutation | Bad client input | Y | Y (existing clampThreshold tests) | N/A | No |
| Linked CTA → AddActivitySheet | Preset task missing | Y | Manual emulator check | Falls back to normal picker | No |
| Clock-rollback tagging | Missing server timestamp column | N ← GAP (pre-implementation) | N (blocked until verified) | N/A | No |
| Clock-rollback tagging (once column exists) | Rolled-back row | Y | Y (unit, mocked server time) | Silently excluded from future derivation | No (dev-only, matches existing posture) |
| Clock-rollback exploit timing | Reward granted before detection | Partial | N (accepted gap, not testable as "fixed") | User sees fabricated reward once | No |
| Sentry init | Native init failure | Y | Manual (can't force a native failure in CI easily) | Nothing | N/A (that's the point — no reporting that session) |

No row has RESCUED=N + TEST=N + USER SEES=Silent. The one true CRITICAL GAP
(missing server timestamp column) is pre-implementation, not silent — it's
called out explicitly and blocks that sub-feature until verified, rather
than shipping broken and silent.

## Diagrams

### Linked-completion CTA — data flow
```
ChallengeDetailScreen (linked, !loggedToday)
        │ tap "Ghi ngay"
        ▼
requestAddActivity({ taskTypeId }) ──▶ [no subscriber?] ──▶ no-op, no crash
        │ subscriber present
        ▼
RootNavigator opens AddActivitySheet(presetTaskTypeId)
        │
        ▼
[preset task in today's suggestions?]
   │ yes                    │ no
   ▼                        ▼
pre-selected chip      normal open, user picks manually
        │
        ▼
useLogTask mutation succeeds ──▶ invalidates ['challenge'] (existing)
        │
        ▼
ChallengeDetailScreen re-renders via useChallengeById (key-prefix match)
```

### Clock-rollback detection — state machine
```
   [activity_log row created locally]
              │
              ▼
   [sync pushes via upsertBatch(.select())]
              │
   ┌──────────┴──────────┐
   │ server timestamp     │ server timestamp
   │ column missing        │ present
   ▼                       ▼
 GAP — no tagging      [logged_at implausibly
 possible (pre-impl      earlier than server
 verification blocks     insert time?]
 this)                   │            │
                    yes  │            │ no
                         ▼            ▼
              is_clock_suspect=1   is_clock_suspect=0
                         │            │
                         ▼            ▼
              excluded from      included in
              getDoneDates()     getDoneDates()
              (future reads      derivation
              only — does NOT
              undo an already-
              granted reward)
```

## Stale Diagram Audit
No existing ASCII diagrams in the files this plan touches beyond the ones
already produced by the 2026-07-08 review (data flow, state machine,
migration sequence, rollback flowchart in that plan's doc) — those remain
accurate for the backend derivation logic, which this plan doesn't modify.

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific
finding above. Run with Claude Code; checkbox as you ship.

- [ ] **T1 (P1, human: ~1h / CC: ~10min)** — UI — Threshold-input chips on `CreateChallengeScreen`
  - Surfaced by: item 1 gap
  - Files: `habit-tracker/src/screens/CreateChallengeScreen.tsx`, `habit-tracker/src/config/i18n.ts`
  - Verify: manual Android emulator check (VI+EN), `tsc`+`jest` green
- [ ] **T2 (P1, human: ~2h / CC: ~20min)** — logic+UI — `useAddActivityIntent()` emitter, `presetTaskTypeId` on `AddActivitySheet`, linked hint/CTA on `ChallengeDetailScreen`
  - Surfaced by: item 2 gap, decision 1A
  - Files: `habit-tracker/src/screens/ChallengeDetailScreen.tsx`, `habit-tracker/src/screens/AddActivitySheet.tsx`, `habit-tracker/src/navigation/RootNavigator.tsx`, `habit-tracker/src/config/i18n.ts`
  - Verify: manual Android emulator check (tap CTA, confirm log + challenge day updates), `tsc`+`jest` green
- [ ] **T3 (P1, human: ~15min / CC: ~5min)** — verify — Confirm Supabase `activity_log` has a server-default insert timestamp column; add one via Supabase migration if missing
  - Surfaced by: outside-voice review, Error & Rescue Registry GAP row
  - Files: live Supabase dashboard; new file under `habit-tracker/supabase/migrations/` if a column must be added
  - Verify: column visible in Supabase table editor / `information_schema`
- [ ] **T4 (P1, human: ~2h / CC: ~20min)** — data — `.select()` on `upsertBatch`, `is_clock_suspect` column (migration vNext), tagging logic in `syncActivity`
  - Surfaced by: item 3 gap, decision (upsert fix)
  - Files: `habit-tracker/src/api/syncService.ts`, `habit-tracker/src/db/migrations.ts`
  - Verify: unit tests (clean ascending, rolled-back, offline-late-sync-within-tolerance), `jest` green
- [ ] **T5 (P1, human: ~1h / CC: ~10min)** — logic — `getDoneDates()`/rollover exclude `is_clock_suspect` rows
  - Surfaced by: item 3 gap
  - Files: `habit-tracker/src/queries/useChallenge.ts`
  - Verify: unit test asserting exclusion, `jest` green
- [ ] **T6 (P2, human: ~3h / CC: ~30min)** — infra — `@sentry/react-native` install, config plugin, guarded init in `App.tsx`, `captureException` wiring
  - Surfaced by: item 4 gap, decision 1B
  - Files: `habit-tracker/App.tsx`, `habit-tracker/app.json`, `habit-tracker/package.json`, `habit-tracker/AGENTS.md` (Known Errors note)
  - Verify: app boots with `EXPO_PUBLIC_SENTRY_DSN` unset (no-op, no crash) and with a placeholder/test DSN set (init doesn't throw); `tsc` green
- [ ] **T7 (P3, human: ~5min / CC: ~2min)** — docs — Add reward-clawback and breadcrumb-analytics TODOs to `TODOS.md`
  - Surfaced by: this review's TODOS.md updates (user-approved)
  - Files: `TODOS.md`
  - Verify: entries present under `## Open`

_No new tasks from Sections 5 (Quality), 7 (Perf), 9 (Deploy beyond T6's native-rebuild note), 10 (Trajectory) — no gaps found beyond what's captured above._

## Completion Summary
```
+====================================================================+
|            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
+====================================================================+
| Mode selected        | HOLD SCOPE                                   |
| System Audit         | 3/4 items already CEO-reviewed 2026-07-08;   |
|                       | item 4 (crash reporting) explicitly new      |
| Step 0               | D1: bundle all 4 in one PR; D2: HOLD SCOPE   |
| Section 1  (Arch)    | 2 issues found (1A emitter pattern, 1B init  |
|                       | try/catch) — both resolved                   |
| Section 2  (Errors)  | 1 GAP found + fixed (2A: conform to          |
|                       | server-time check, not local cursor)         |
| Section 3  (Security)| 0 issues — DSN public-safe, no new attack    |
|                       | surface                                      |
| Section 4  (Data/UX) | 0 unhandled edge cases — covered by          |
|                       | construction (server clamping, idempotent    |
|                       | modal state)                                 |
| Section 5  (Quality) | 0 issues — reuses existing chip/emitter      |
|                       | patterns                                     |
| Section 6  (Tests)   | Diagram produced, 0 gaps beyond outside-     |
|                       | voice findings (already resolved)            |
| Section 7  (Perf)    | 0 issues — existing index covers it          |
| Section 8  (Observ)  | This item IS the observability fix;          |
|                       | alerting/runbook policy explicitly deferred  |
| Section 9  (Deploy)  | 1 note — Sentry needs native rebuild, dev    |
|                       | client won't reflect it until rebuilt        |
| Section 10 (Future)  | Reversibility 5/5 (schema, Sentry removal),  |
|                       | 4/5 (emitter)                                |
| Section 11 (Design)  | 0 issues — reuses existing chip visual       |
|                       | language, a11y roles noted for new chips     |
+--------------------------------------------------------------------+
| NOT in scope         | written (4 items)                            |
| What already exists  | written (5 items)                            |
| Dream state delta    | written                                       |
| Error/rescue registry| 8 methods, 1 pre-implementation GAP (T3)     |
| Failure modes        | 6 total, 0 silent CRITICAL GAPS              |
| TODOS.md updates     | 2 proposed, 2 accepted (reward clawback,     |
|                       | breadcrumb analytics)                        |
| Scope proposals      | N/A (HOLD SCOPE — no expansion ceremony)     |
| CEO plan             | skipped (HOLD SCOPE doesn't write one)       |
| Outside voice        | Codex quota exhausted; Claude subagent ran,  |
|                       | found 2 substantive issues (both fixed) +    |
|                       | 1 minor misattribution (fixed)               |
| Diagrams produced    | 2 (CTA data flow, clock-rollback state       |
|                       | machine) — backend diagrams from the         |
|                       | 2026-07-08 review remain accurate, reused    |
| Stale diagrams found | 0                                             |
| Unresolved decisions | 0                                             |
+====================================================================+
```

### Unresolved Decisions
None — all findings (1A, 1B, 2A, both outside-voice findings, both TODO
proposals) were presented via AskUserQuestion and resolved.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_found (all resolved) | 4 findings (1A, 1B, 2A, upsert/timing gaps) — all fixed in-plan |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | Codex quota exhausted; not run this pass |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | Not yet run — required before shipping |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | Not run — small additive UI reusing existing chip patterns, low risk |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Not run — not applicable to this scope |

**CROSS-MODEL:** Outside voice (Claude subagent, Codex unavailable this pass) found 3 issues: 1 factual correction (redundant invalidation claim, fixed), 1 load-bearing implementation gap (`upsertBatch` missing `.select()`, fixed), 1 strategic gap (reward-clawback timing, resolved as an explicitly-documented accepted limitation + deferred TODO). No disagreement with the in-session review findings — the outside voice found things the in-session review missed rather than contradicting it.
**VERDICT:** CEO review complete, all findings resolved. Eng review required before shipping (not yet run).

NO UNRESOLVED DECISIONS
