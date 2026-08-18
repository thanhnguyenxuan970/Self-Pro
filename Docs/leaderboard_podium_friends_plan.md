# Leaderboard — Podium + Anti-Inflation Ceiling + Friend Ladder

> **SUPERSEDED by `friends_streak_system_plan.md`. Do not build from this doc.**
>
> This plan optimised the global ladder before establishing that at under 20
> signed-in accounts the global ladder cannot address the actual problems
> (ladder reads as fake, no daily pull, no reason to invite). The podium and
> the anti-inflation ceiling are both deferred. Retained only for the §1.3
> analysis of why per-day star caps fail against `useBackfill.ts` and against
> client-supplied `local_date` — that reasoning stays valid if cheating ever
> becomes real.

Implementation plan. Written against the code as it exists at migration 028 /
`src/screens/RankScreen.tsx` @483 lines / `src/queries/useLeaderboard.ts` @217 lines.
Nothing here has been built yet.

---

## 0. Premises — what is already true

Stated so the plan is not re-deriving things the repo already decided.

1. **A global leaderboard already ships.** `get_global_leaderboard_v2`
   (028) returns top 50 + the caller's ±5 neighbourhood, keyed on
   `users.leaderboard_public_id`, carrying `lifetime_stars` and
   `current_streak`. `RankScreen` renders it with expandable rows and an
   honest gap marker (`hasRankGapBefore`).
2. **Pseudonymity is a deliberate, documented decision** (022–024,
   `src/config/playerNames.ts`). The stated reason is that a closed,
   server-generated name set is *not* user-generated content, so no
   moderation / reporting / blocking obligation follows. Any plan that puts a
   user-typed or Google-sourced name on the **global** ladder reverses that
   decision and inherits those obligations.
3. **The server holds the real ledger.** `public.activity_log` is synced from
   the device (`syncService.ts:181`, RLS own-rows insert) and
   `sync_lifetime_stars()` (021) recomputes the total *server-side* from it.
   So an anti-abuse bound is enforceable in SQL — it does not require the
   local-first architecture to change.
4. **The client is still trusted for content.** `logged_at`, `local_date`,
   `week_start` and `stars_delta` are all client-supplied. Only
   `activity_log.created_at` is server-assigned — `src/lib/clockSuspect.ts`
   already relies on exactly this asymmetry.
5. **`sync_lifetime_stars` is monotonic**: `GREATEST(stored, event_stars)`.
   Totals can never be lowered by design. This constrains every anti-cheat
   option below (see §2.4).

**Decisions taken** (from the clarification round):

| Question | Decision |
|---|---|
| Global ladder identity | Pseudonym — unchanged |
| Friend ladder identity | Real name + avatar |
| Ranking metric | `lifetime_stars` — unchanged |
| Anti-cheat | Soft server-side ceiling |
| Friend connection | 6-character invite code |
| Order | Phase 1 podium + ceiling → Phase 2 friends |

---

## Phase 1 — Podium + ceiling

Small, self-contained, no new tables in the client DB, no new user-facing
identity. Ship this before touching friendships.

### 1.1 Podium UI (`RankScreen.tsx`)

**Split logic goes in `useLeaderboard.ts`, not the screen.** That file is
already written as pure, unit-tested helpers (`annotateStarsToNextRank`,
`capLeaderboardRows`, `hasRankGapBefore`); the podium split belongs in the
same family.

```ts
export type PodiumSplit = { podium: LeaderboardEntry[]; rest: LeaderboardEntry[] };

/**
 * Splits ranks 1-3 out for podium rendering. Returns an empty podium when
 * fewer than three players exist — a podium with empty plinths reads as a
 * broken screen, not as an early-days ladder.
 */
export function splitPodium(entries: LeaderboardEntry[]): PodiumSplit;
```

Rules:

- Podium renders **only** when `entries.length >= 3` **and** `entries[0..2]`
  have ranks exactly `1, 2, 3`. Otherwise `podium: []` and the screen falls
  back to today's flat list, unchanged.
- Visual order left→right is **2 · 1 · 3**, heights `0.8 · 1.0 · 0.72`.
- The list below starts at rank 4.

**Avatar problem, and the answer.** A podium normally carries a face; the
global ladder has no faces and must not acquire one. Use the **rank tier
mascot/icon derived client-side from `lifetimeStars`** via
`getRankConfigByTierOrder` / `RANKS` (`src/config/ranks.config.ts`). This is
a pure function of a number the client already receives, so it leaks nothing
new, needs no server column, and makes the three plinths visually distinct.

**Bug this will cause if not handled — call it out now.**
`LeaderboardSection` computes `currentUserVisible` from the rows it renders
and appends a pinned "you" row when the caller is missing. If the caller is
rank 2, they move to the podium, disappear from `visible`, and the section
will render them **twice** — once on the plinth, once pinned at the bottom.
`currentUserVisible` must be computed over `podium.concat(rest)`, not `rest`.
This is the single most likely defect in Phase 1; it needs a named test.

**Other constraints:**

- `capLeaderboardRows` ceiling of 50 counts podium + list together.
- Gate any plinth animation on `useReduceMotion()` (hook already used in this
  screen).
- New theme tokens required — `theme.ts` has `starGold` / `starGoldText` /
  `starGoldMuted` but **no silver or bronze**. Add `podiumSilver`,
  `podiumSilverText`, `podiumBronze`, `podiumBronzeText` for **both** light
  and dark palettes, WCAG AA against their plinth fill.
- Podium tiles are `accessibilityRole="button"` and expand in place, same
  contract as `LeaderboardRow` — do not introduce a second interaction model.

### 1.2 i18n

New keys in **both** `vi` and `en` blocks of `src/config/i18n.ts`, following
the existing `leaderboard*` naming:

```
leaderboardPodiumFirst / Second / Third
leaderboardPodiumHint          // accessibility hint for a plinth
```

Vietnamese is the default per `PRODUCT.md`; write it first, then the English.

### 1.3 Anti-inflation ceiling — migration 029

**Threat.** `stars_delta` arrives from the device. Nothing today stops a
modified client from inserting one row with `stars_delta = 10_000_000`.
Today that only pollutes a pseudonymous ladder; once Phase 2 puts real names
next to totals, a visible cheater is a credibility problem.

**Rejected design A — cap stars per server day.** `activity_log.created_at`
is trustworthy, so this is tempting. It is wrong: `useBackfill.ts` exists and
users sync after being offline, so a fortnight of legitimate history lands
with today's `created_at` and would be truncated. **Reject.**

**Rejected design B — cap stars per client `local_date`.** Handles the
backfill case, but `local_date` is client-supplied: an attacker spreads the
same total across 3,650 fabricated past dates and clears every per-day cap.
**Reject.**

**Chosen design — an account-age ceiling on the total.** Bound the total
itself against how long the account has existed. The client cannot forge
account age, so no amount of date fabrication helps.

```
ceiling := STARTING_ALLOWANCE + DAILY_CAP * (account_age_days + 1)
next    := GREATEST(stored, LEAST(event_stars, ceiling))
```

- `GREATEST(stored, …)` preserves the existing monotonic guarantee.
- `LEAST(event_stars, ceiling)` bounds *new* growth only.
- `STARTING_ALLOWANCE` exists because a genuine user may have months of
  offline local history before their first sign-in.

Requires `public.users.created_at timestamptz NOT NULL DEFAULT now()` —
002 does not define one. Backfill from `auth.users.created_at` where the
email matches, `now()` otherwise.

Put `STARTING_ALLOWANCE` and `DAILY_CAP` in a
`public.leaderboard_limits` single-row config table, not in the function
body, so tuning is an `UPDATE` rather than a migration.

**Ship it observe-only first. This is the important part.**

We have **zero measurements** of real star velocity. A cap set too low
silently truncates honest users' totals, and because the function is
monotonic there is no signal afterwards that it happened — the damage is
invisible and unrecoverable. So:

- **029 (observe):** compute `ceiling`, write a row to
  `public.leaderboard_limit_events` when `event_stars > ceiling`, but return
  `GREATEST(stored, event_stars)` — behaviour unchanged.
- Let it run ≥ 2 weeks. Read the p99 of `event_stars / account_age_days`.
- **030 (enforce):** set the real constants from that data, switch the return
  to the clamped expression.

Shipping the clamp on day one would be guessing with unrecoverable
consequences.

**Residual risk, accepted and documented:** monotonicity means any account
already inflated stays inflated forever. Enforcement bounds the future, not
the past. If a manual correction is ever needed it has to be a deliberate,
logged admin operation — not something the client can trigger.

### 1.4 Verification (Phase 1)

Per `AGENTS.md`, UI claims require an actual emulator run.

1. `npm test` — new unit tests:
   - `splitPodium` with 0 / 1 / 2 / 3 / 51 entries
   - `splitPodium` when ranks are non-consecutive (caller-neighbourhood payload)
   - **caller at rank 2 renders exactly once** (the §1.1 bug)
   - `capLeaderboardRows` total stays ≤ 50 with the podium included
2. SQL, run against a scratch Supabase project — never production first:
   - fresh account, `event_stars` under ceiling → unchanged
   - fresh account, 10,000,000-star row → limit event written, total still
     returned unclamped in 029
   - existing account with a total above its ceiling → **not** reduced
3. Android emulator, screenshotted: light + dark, VI + EN, 3-player ladder,
   2-player ladder (podium suppressed), caller at rank 2, caller unranked.

---

## Phase 2 — Friend ladder (design only; do not build during Phase 1)

This is the largest of the three items. Recorded now so Phase 1 does not
paint it into a corner; scheduled after Phase 1 ships.

### 2.1 Identity — the privacy hinge

Real name + avatar are shown **only between mutually-confirmed friends**. The
global ladder is untouched.

**A 6-character code must not be sufficient on its own.** `32^6 ≈ 1.07e9`
resists casual guessing but a code shared into a group chat, screenshotted,
or brute-forced would otherwise hand a stranger the user's real name and
photo. So: entering a code creates a **pending request**; identity is
revealed only after the other side accepts. Codes must be rotatable from
Settings, and `add_friend_by_code` must be server-side rate-limited
(≈10 attempts/hour/account, counter table, not client-side).

**Scope cut for v1: name + generated initials avatar, no photo.** A Google
`picture` URL expires, needs caching, and turns a text feature into an image
pipeline. Ship names first; photos are a follow-up if anyone asks.

Requires storing `display_name` on `public.users` — it is not there today.
This *is* the UGC boundary being crossed, narrowly: the name comes from
Google rather than a text field, and is visible only to confirmed friends.
That combination is what keeps moderation obligations proportionate. If the
name ever becomes user-editable, that argument collapses and a moderation
plan becomes mandatory.

### 2.2 Schema sketch (migration 03x)

```sql
ALTER TABLE public.users
  ADD COLUMN display_name text,
  ADD COLUMN friend_code  text UNIQUE;   -- 6 chars, unambiguous alphabet
                                         -- (no 0/O/1/I/L)

CREATE TABLE public.friendships (
  requester_email text NOT NULL,
  addressee_email text NOT NULL,
  status          text NOT NULL CHECK (status IN ('PENDING','ACCEPTED','BLOCKED')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_email, addressee_email)
);
```

RPCs, all `SECURITY DEFINER` + explicit `REVOKE … GRANT TO authenticated`,
matching the 021 house style:

- `request_friend_by_code(p_code text)`
- `respond_to_friend_request(p_public_id uuid, p_accept boolean)`
- `remove_friend(p_public_id uuid)`
- `get_friend_leaderboard()` → accepted friends + self, ranked by
  `lifetime_stars`, returning `display_name` **only** for accepted edges

### 2.3 Knock-on changes that are easy to forget

- **`delete_my_account_data()` (021) must also delete friendship rows.** It
  currently deletes `activity_log`, `fund_transactions`, `users`. A stale
  friendship row pointing at a deleted account is a data-deletion defect, and
  there is a `deletion-request/` directory in the repo implying this is
  already a compliance surface.
- `reset_my_progress()` should **not** drop friendships — resetting progress
  is not leaving the social graph. Confirm intent explicitly.
- A new tab or segmented control on `RankScreen` (Global / Friends), plus a
  friend-management screen. `RankScreen` is already 483 lines and flagged
  `fallow-ignore-next-line complexity` — extract `LeaderboardSection` into
  `src/components/` before adding a second ladder to it.
- Empty state for a user with zero friends must sell the invite code, not
  render a blank list.

---

## Sequencing

| # | Item | Blast radius |
|---|---|---|
| 1 | `splitPodium` + tests | pure function |
| 2 | Podium theme tokens (light + dark) | `theme.ts` |
| 3 | Podium UI + i18n | `RankScreen.tsx` |
| 4 | Migration 029 — ceiling, observe-only | Supabase |
| 5 | *(≥ 2 weeks of data)* | — |
| 6 | Migration 030 — enforce ceiling | Supabase |
| 7 | Extract `LeaderboardSection` to `components/` | refactor, no behaviour change |
| 8 | Phase 2 friendships | new tables + screens |

Steps 1–4 are one working session. Step 8 is a project.

---

## Open questions

1. `DAILY_CAP` / `STARTING_ALLOWANCE` values — **deliberately unset**;
   they come from step 5's data, not from a guess.
2. Does the podium show a plinth for the caller when they are rank ≥ 4, or
   is the pinned "you" row enough? Recommendation: pinned row only. Two
   simultaneous representations of the same player is the §1.1 bug wearing a
   disguise.
3. Phase 2 — do friend requests need a notification? `expo-notifications` is
   already a dependency, so it is cheap, but it is also the first
   person-to-person notification in the app and therefore the first
   harassment vector. Defer to Phase 2 planning.
