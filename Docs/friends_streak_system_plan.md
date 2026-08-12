# Friends Streak System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-safe friend system where authenticated users connect by invite code with explicit consent, compare lifetime stars and effective streaks among accepted friends, and can reliably discover incoming requests.

**Architecture:** Supabase owns social identity, relationship transitions, privacy, abuse controls, and friend ranking. The Expo client owns local activity truth, synchronizes a bounded profile signal through a versioned RPC, and renders server-authoritative social data through a small API/query/component boundary. The existing global leaderboard remains unchanged and is extracted from `RankScreen` before the Friends segment is added.

**Tech Stack:** Expo SDK 56, React Native 0.85, TypeScript 6, TanStack Query v5, expo-sqlite, Supabase/PostgreSQL, PostgreSQL RLS and SECURITY DEFINER RPCs, Jest/ts-jest, React Native Testing Library, pgTAP.

## Global Constraints

- Social identity is `auth.uid()`. Email remains only as a compatibility key for released clients and legacy progress tables.
- Keep `sync_user_profile(integer)`, existing leaderboard RPCs, and email-backed progress RPCs callable by released app versions.
- Every social mutation derives the caller from the authenticated session; no client-supplied caller UUID or email is accepted.
- Expected business outcomes return typed status data and commit normally; they do not `RAISE EXCEPTION`.
- One canonical relationship row represents an unordered user pair. Never create mirrored A→B and B→A rows.
- `blocked` dominates concurrent transitions. Only the blocker can unblock.
- Accepted-friend cap is 100 per user. Pending caps are 20 outgoing and 50 incoming per user. Pending requests expire after 30 days. Blocked rows do not expire.
- Invite-code attempts are limited to 10 per rolling hour per authenticated user and are charged before code lookup.
- Friend code alphabet is `23456789ABCDEFGHJKMNPQRSTUVWXYZ`: 31 symbols, so the space is `31^6 = 887,503,681`.
- Effective streak is never the stored streak alone. It is freshness-gated against the profile owner’s validated IANA timezone.
- The client-reported freshness date is derived from local SQLite `TASK` and `CHALLENGE` activity after log, unlog, edit, delete, and backfill flows. Synthetic `LOGIN` and `DAILY_BONUS` rows never establish freshness.
- Friend rank uses `DENSE_RANK()` over the current user plus accepted friends: `100, 100, 80 → 1, 1, 2`.
- Pending identity is asymmetric: the recipient sees the requester’s display name; the requester does not see the recipient’s identity until acceptance.
- Friend UI uses the current user-selected theme, Be Vietnam Pro tokens, minimum 44-point touch targets, bounded VI/EN text, and reduced-motion behavior.
- The user owns visual design. Implementation may build only the structure, states, interactions, theme-token hooks, and accessibility contract defined here until approved visual specifications are supplied.
- Preserve unrelated dirty work. Do not modify or stage the existing deleted parent `Docs` files.
- Deploy backend additively before releasing a client that calls the new RPCs.

---

## 1. Product Contract

### 1.1 Problem and mechanism

At fewer than 20 signed-in accounts, a global lifetime ladder is too sparse and slow-moving to create a believable daily social loop. Friends creates a deliberately small comparison group while leaving the existing global leaderboard untouched.

The v1 loop is:

1. User shares a persistent six-character friend code.
2. Another authenticated user enters the code.
3. A pending request is created without disclosing the recipient’s identity to the requester.
4. The recipient sees an app-level Rank-tab badge and an incoming request containing the requester’s display name.
5. Accepting creates an accepted relationship; reciprocal pending requests auto-accept atomically.
6. Both users can see effective streak, lifetime stars, and dense rank among their accepted friend set.
7. Either user can remove the friendship. Either user can block; only the blocker can unblock.

### 1.2 Included

- Friend-code creation, copy, share, and rotation.
- Incoming request inbox, outgoing pending list, accept, reject, cancel, remove, block, and unblock.
- Rank-tab pending badge loaded at authenticated app entry and refreshed on foreground.
- Accepted friend dashboard with the current user included.
- Effective streak gated by freshness and per-user timezone.
- Offline/cache/error/empty distinctions.
- VI and EN copy keys.
- Backend pgTAP tests, client Jest/RNTL tests, CI database test job, and emulator verification.

### 1.3 Explicitly out of scope

- Push notifications, realtime subscriptions, poke/nudge, chat, and direct messaging.
- Friend photos.
- Deep-link code prefill.
- Global leaderboard redesign, podium, weekly/monthly friend windows, and anti-inflation changes.
- Arbitrary profile editing. Display name comes from the caller’s authenticated Google metadata and is sanitized server-side.
- Visual design decisions beyond the structural contract in §6.

---

## 2. Correctness and Security Model

### 2.1 Identity bridge and email reconciliation

Migration 029 adds `public.users.auth_user_id uuid` and backfills it from `auth.users.id` only when the normalized email match is unique on both sides. Before changing any data, the migration aborts if it detects:

- two `public.users` rows with the same `lower(user_email)`;
- two auth users with the same `lower(email)`;
- a public user with no unique auth match;
- more than one public row mapping to the same auth UUID.

After a successful backfill:

```sql
ALTER TABLE public.users
  ALTER COLUMN auth_user_id SET NOT NULL,
  ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id),
  ADD CONSTRAINT users_auth_user_id_fkey
    FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

Replace migration 027’s insert-only trigger with an insert/update reconciliation trigger. When an auth email changes, one transaction updates `public.users.user_email` and every retained legacy email-keyed table used by released clients, including `activity_log` and `fund_transactions`. It must reject collisions rather than merge accounts. Social rows remain attached to UUID and therefore do not move or split.

### 2.2 Canonical relationship state machine

```text
absent ──request──> pending ──accept──> accepted ──remove──> absent
   │                    │                  │
   └──────block─────────┴──────block───────┘──> blocked
                                                │
                                                └──unblock by blocker──> absent

pending + reciprocal request ──atomic──> accepted
blocked + any non-unblock transition ──> blocked
```

Every mutation calculates `(user_a_id, user_b_id)` by UUID order, obtains a transaction-scoped advisory lock for that pair, and then reads the row `FOR UPDATE`. This lock is required even when no row exists, because two simultaneous first requests cannot both lock a missing row.

### 2.3 Freshness

Local profile sync calculates:

```sql
SELECT MAX(local_date) AS last_active_local_date
FROM activity_log
WHERE user_id = ?
  AND source IN ('TASK', 'CHALLENGE');
```

The server validates `p_timezone` against `pg_timezone_names`, rejects malformed dates, and never accepts a future `last_active_local_date` relative to that timezone. Friend reads calculate:

```sql
effective_streak := CASE
  WHEN last_active_local_date IN (today_in_owner_timezone, today_in_owner_timezone - 1)
    THEN GREATEST(current_streak, 0)
  ELSE 0
END;
```

This client-derived field is intentional: current activity sync has no tombstone/delete protocol. A local activity deletion cannot leave a stale remote activity row authoritative for social freshness.

### 2.4 Privacy

- Accepted rows expose public player UUID, sanitized display name, effective streak, lifetime stars, dense rank, and `is_current_user`.
- Incoming pending rows expose request public UUID, requester public player UUID, requester display name, and creation/expiry dates.
- Outgoing pending rows expose only request public UUID and dates; recipient UUID/name is null.
- Blocked relationships are absent from dashboard results.
- Entering a blocked user’s code returns the same public `NOT_FOUND` result as an invalid code.
- Email, auth UUID, timezone, raw freshness date, and blocker identity never leave social RPCs.

### 2.5 Availability behavior

- Cached friend data remains visible when refresh fails, with a stale/error banner.
- A first-load failure is an error/retry state, never an empty-friends state.
- PostgREST `PGRST202`, missing migration, or unavailable Supabase maps to `UNAVAILABLE`, rendered as “Friends temporarily unavailable.”
- Mutation buttons disable while their exact relationship mutation is pending to prevent double-submit.

---

## 3. Database Contract — Migrations 029–031

Migration files are immutable once committed or applied. The backend is split into three independently testable migrations:

- `supabase/migrations/029_social_identity_bridge.sql`: UUID backfill, constraints, auth provisioning, and legacy email reconciliation.
- `supabase/migrations/030_friend_relationships.sql`: social profile columns, relationship/attempt tables, invite-code and transition RPCs.
- `supabase/migrations/031_friend_dashboard.sql`: profile v2 sync, pending-count read, and freshness-gated friend dashboard.

### 3.1 Profile columns

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS last_active_local_date date,
  ADD COLUMN IF NOT EXISTS friend_code text;

CREATE UNIQUE INDEX users_friend_code_idx
  ON public.users (friend_code)
  WHERE friend_code IS NOT NULL;
```

Server sanitization rules:

- `display_name`: Unicode trim, collapse whitespace, remove control characters, maximum 80 Unicode code points; null if nothing remains.
- `timezone`: exact name present in `pg_timezone_names`; null/invalid input falls back to `Asia/Ho_Chi_Minh` only for the owner’s profile, while friend-read invalid data yields effective streak 0.
- `last_active_local_date`: nullable; must not exceed the current date in the validated timezone.

### 3.2 Relationship table

```sql
CREATE TABLE public.friend_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES public.users(auth_user_id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES public.users(auth_user_id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('pending', 'accepted', 'blocked')),
  requested_by uuid,
  blocked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  expires_at timestamptz,
  CHECK (user_a_id < user_b_id),
  CHECK (requested_by IS NULL OR requested_by IN (user_a_id, user_b_id)),
  CHECK (blocked_by IS NULL OR blocked_by IN (user_a_id, user_b_id)),
  CHECK (
    (state = 'pending'  AND requested_by IS NOT NULL AND blocked_by IS NULL AND accepted_at IS NULL AND expires_at IS NOT NULL) OR
    (state = 'accepted' AND requested_by IS NOT NULL AND blocked_by IS NULL AND accepted_at IS NOT NULL AND expires_at IS NULL) OR
    (state = 'blocked'  AND blocked_by IS NOT NULL AND accepted_at IS NULL AND expires_at IS NULL)
  ),
  UNIQUE (user_a_id, user_b_id)
);

ALTER TABLE public.friend_relationships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friend_relationships FROM PUBLIC, anon, authenticated;

CREATE INDEX friend_relationships_a_state_idx
  ON public.friend_relationships (user_a_id, state, created_at DESC);
CREATE INDEX friend_relationships_b_state_idx
  ON public.friend_relationships (user_b_id, state, created_at DESC);
CREATE INDEX friend_relationships_pending_expiry_idx
  ON public.friend_relationships (expires_at)
  WHERE state = 'pending';
```

There are no direct table policies for authenticated users. All reads and writes use narrowly scoped SECURITY DEFINER RPCs.

### 3.3 Rate-limit table

```sql
CREATE TABLE public.friend_code_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX friend_code_attempts_user_time_idx
  ON public.friend_code_attempts (auth_user_id, attempted_at DESC);

ALTER TABLE public.friend_code_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friend_code_attempts FROM PUBLIC, anon, authenticated;
```

`request_friend_by_code` obtains an advisory lock scoped to the caller UUID, deletes attempts older than one hour for that caller, inserts the new attempt, counts the trailing hour, and returns `RATE_LIMITED` when count exceeds 10. The result is returned normally so the inserted attempt commits.

### 3.4 RPC interfaces

All functions are `SECURITY DEFINER SET search_path = public, pg_temp`, revoke execution from `PUBLIC`, `anon`, and `authenticated`, then grant only the exact signatures to `authenticated`.

```sql
sync_user_profile_v2(
  p_current_streak integer,
  p_last_active_local_date date,
  p_timezone text
) RETURNS void

get_or_create_my_friend_code() RETURNS text
rotate_my_friend_code() RETURNS text

request_friend_by_code(p_code text)
RETURNS TABLE(status text, retry_after_seconds integer)

respond_to_friend_request(p_request_id uuid, p_action text)
RETURNS TABLE(status text)

cancel_friend_request(p_request_id uuid)
RETURNS TABLE(status text)

remove_friend(p_relationship_id uuid)
RETURNS TABLE(status text)

block_friend(p_relationship_id uuid)
RETURNS TABLE(status text)

unblock_friend(p_relationship_id uuid)
RETURNS TABLE(status text)

get_friend_pending_count() RETURNS integer

get_my_friend_dashboard()
RETURNS TABLE(
  relationship_id uuid,
  section text,
  player_id uuid,
  display_name text,
  effective_streak integer,
  lifetime_stars real,
  friend_rank bigint,
  is_current_user boolean,
  created_at timestamptz,
  expires_at timestamptz
)
```

Allowed public mutation statuses:

```text
PENDING | ACCEPTED | OK | NOT_FOUND | SELF | ALREADY_PENDING |
ALREADY_FRIENDS | RATE_LIMITED | FRIEND_LIMIT_REACHED |
PENDING_LIMIT_REACHED | FORBIDDEN
```

`request_friend_by_code` normalizes with Unicode trim and uppercase, validates exactly six alphabet characters, and returns `NOT_FOUND` for malformed, unknown, expired, or blocked targets. It checks both users’ accepted caps when auto-accepting. `respond_to_friend_request(..., 'accept')` checks both users’ accepted caps inside the pair lock.

`get_my_friend_dashboard()` prunes expired pending rows first and calculates accepted ranks with:

```sql
DENSE_RANK() OVER (
  ORDER BY GREATEST(COALESCE(lifetime_stars, 0), 0) DESC
)
```

The ranking set is exactly the caller plus their accepted friends.

### 3.5 Existing RPC behavior

- Keep `sync_user_profile(integer)` unchanged for released clients.
- `sync_user_profile_v2` updates the caller’s row by `auth.uid()` and derives `display_name` from authenticated JWT metadata.
- `reset_my_progress()` resets progress fields but preserves relationships, blocks, and friend code.
- `delete_my_account_data()` explicitly deletes the caller’s `friend_code_attempts`, then deletes the caller’s public user row; UUID foreign keys cascade relationships. Deleting the auth user also cascades attempts directly.
- Retained email RPCs continue to use the reconciled current email. Do not grant broad SELECT/UPDATE on `public.users`.

---

## 4. Client Module Contract

### 4.1 Files and responsibilities

```text
src/api/friendsApi.ts
  Supabase RPC transport, remote row types, status normalization, UNAVAILABLE mapping

src/lib/friends.ts
  Pure display-name fallback, Unicode initials, avatar palette slot, row mapping

src/queries/useFriends.ts
  Query keys, dashboard/code/pending-count queries, mutations, invalidation

src/components/LeaderboardSection.tsx
  Extracted existing global leaderboard section; no behavior change

src/components/friends/FriendsSection.tsx
  Structural state switch and section composition

src/components/friends/FriendRow.tsx
  Accepted/self row contract

src/components/friends/FriendRequestRow.tsx
  Incoming/outgoing request contract and allowed actions

src/components/friends/InitialsAvatar.tsx
  Theme palette-slot rendering and accessible decoration behavior

src/components/friends/AddFriendSheet.tsx
  My code, copy/share/rotate, code entry, typed result feedback

src/navigation/RootNavigator.tsx
  Authenticated app-level pending query, Rank tab badge, foreground refresh

src/screens/RankScreen.tsx
  Global/Friends segment ownership and AddFriendSheet visibility

src/config/i18n.ts
  Complete VI/EN `friends*` copy
```

### 4.2 API types

```ts
export type FriendMutationStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'OK'
  | 'NOT_FOUND'
  | 'SELF'
  | 'ALREADY_PENDING'
  | 'ALREADY_FRIENDS'
  | 'RATE_LIMITED'
  | 'FRIEND_LIMIT_REACHED'
  | 'PENDING_LIMIT_REACHED'
  | 'FORBIDDEN'
  | 'UNAVAILABLE';

export type FriendSection = 'self' | 'accepted' | 'incoming' | 'outgoing';

export type RemoteFriendDashboardRow = {
  relationship_id: string | null;
  section: FriendSection;
  player_id: string | null;
  display_name: string | null;
  effective_streak: number | null;
  lifetime_stars: number | null;
  friend_rank: number | null;
  is_current_user: boolean;
  created_at: string | null;
  expires_at: string | null;
};

export type FriendActionResult = {
  status: FriendMutationStatus;
  retryAfterSeconds: number | null;
};
```

Every exported API function receives `currentUserEmail` only so it can call the existing `ensureSupabaseSession(currentUserEmail)` guard. It never sends that email to a social RPC.

### 4.3 Query keys and invalidation

```ts
export const friendKeys = {
  all: (accountSub: string) => ['friends', accountSub] as const,
  dashboard: (accountSub: string) => ['friends', accountSub, 'dashboard'] as const,
  code: (accountSub: string) => ['friends', accountSub, 'code'] as const,
  pendingCount: (accountSub: string) => ['friends', accountSub, 'pending-count'] as const,
};
```

- Key by stable Google `sub`, never email alone, so account switches cannot reuse social cache.
- Pending count is enabled at authenticated app entry, refetched on app foreground, and displayed as a Rank tab badge.
- Dashboard is enabled only while the Friends segment is active.
- Successful relationship mutations invalidate dashboard and pending count.
- Accepted/remove/block changes also invalidate `['leaderboard']` only if shared profile sync could affect the currently rendered signal; global ranking contents remain unchanged.
- Rotation invalidates only friend code.

### 4.4 Pure helper contract

```ts
export function sanitizeDisplayName(name: string | null): string | null;
export function initialsFromName(name: string | null, fallback: string): string;
export function avatarPaletteSlot(playerId: string): number; // integer 0..5
export function mapFriendDashboardRows(
  rows: RemoteFriendDashboardRow[],
  fallbackPlayerLabel: string,
): FriendDashboard;
```

Initials rules: normalize NFC, collapse whitespace, retain Unicode letters/numbers, use the first code point of first and last tokens, or up to two code points for a one-token name. Emoji-only, blank, or null names use the localized fallback. Avatar helper returns a semantic slot, never a hardcoded color.

### 4.5 Profile sync consolidation

Modify `src/api/syncService.ts` so the single account sync pipeline queries in one SQLite read:

```sql
SELECT
  COALESCE((SELECT streak_count FROM daily_summary
            WHERE user_id = u.id ORDER BY local_date DESC LIMIT 1), 0) AS current_streak,
  (SELECT MAX(local_date) FROM activity_log
    WHERE user_id = u.id AND source IN ('TASK', 'CHALLENGE')) AS last_active_local_date,
  u.timezone AS timezone
FROM users u
WHERE u.id = ?;
```

Call `sync_user_profile_v2` after activity/fund upload so profile state represents the completed local mutation. Remove the parallel `syncUserStreak()` + `syncCurrentUserToSupabase()` call in `useToday.ts`; use only `syncCurrentUserToSupabase()`. Delete or reduce `syncUserStreak` to a compatibility wrapper only if another checked-in caller remains after `rg` verification.

---

## 5. Stress-Tested UI Direction — Visual Execution Owned by User

### 5.1 Chosen direction

The approved direction is a **competitive race ladder**, not a three-slot podium.
The Friends experience must feel energetic without claiming seasons, weekly resets,
rank movement, or head-to-head challenges that the backend does not provide.

A physical gold/silver/bronze podium is forbidden for v1. `DENSE_RANK()` permits
multiple users at rank `#1`, `#2`, or `#3`; placing people into three unique visual
slots would fabricate an ordering. Top-rank styling therefore belongs to a rank
group and is shared by every player with that rank.

The Global/Friends segment sits immediately below the Rank title. Selecting Friends
replaces the Global hero, roadmap, and leaderboard rather than rendering Friends
below them. The three highest-priority things in the first Friends viewport are:

1. current-user competition status and Add Friend action;
2. any incoming request requiring consent;
3. the start of the friend race ladder.

```text
RankScreen
├── Title row: Rank                                                [?]
├── SegmentControl: [ Global ] [ Friends · incoming_count ]
├── Global selected
│   └── Existing rank hero + roadmap + global LeaderboardSection
├── Friends selected
│   └── FriendsSection (virtualized root, never nested in Global ScrollView)
│       ├── stale/offline banner when cached data is retained
│       ├── CompetitionSummary
│       │   ├── current dense rank / participant count
│       │   ├── lifetime stars + effective streak
│       │   ├── truthful target copy
│       │   └── Add Friend trigger
│       ├── IncomingRequests (expanded, highest action priority)
│       ├── RaceLadder
│       │   ├── rank groups that support ties
│       │   ├── current user highlighted in normal sorted position
│       │   └── accepted friends
│       └── OutgoingRequests (collapsed by default)
└── AddFriendSheet outside both scroll roots
    ├── visible sheet title and close action
    ├── MyFriendCode
    │   ├── Copy
    │   ├── Share
    │   └── overflow → Rotate → confirmation
    ├── visible FriendCodeInput label + one real six-character input
    ├── Submit
    └── StructuredResultMessage
```

`RankScreen` must use conditional scroll ownership: Global keeps its existing
`ScrollView`; Friends owns a `SectionList`/`FlatList`-equivalent virtualized root for
up to 101 ranked rows plus requests. A virtualized Friends list must never be nested
inside the Global `ScrollView`. `AddFriendSheet` remains a sibling outside both.

### 5.2 Competition semantics

`CompetitionSummary` is a compact status surface, not a second rank hero. It may show:

- `Rank #4 of 12` (participant count is self plus accepted friends);
- lifetime stars and effective streak from the current dashboard row;
- `You are leading` when no row has more stars;
- `Tied at #1` or `Tied at #N` when another row shares the current rank;
- `X ★ to catch <name>` using the nearest accepted row with strictly more stars.

“Catch” is the exact positive star difference. Do not say “overtake” unless the UI
adds one more star to that difference. Do not render a progress bar: there is no
stable finite race endpoint. Do not render up/down arrows, “season,” “this week,” a
countdown, or historical movement because none exists in the data contract.

The summary already represents the current user, so it is not sticky. The current
user still appears once in the correctly sorted ladder and receives a `You` label
plus selected-theme emphasis. This avoids duplicated sticky content, obscured rows,
and confusing screen-reader order.

Each ladder row exposes, in order:

```text
[dense rank] [initials avatar] [bounded display name + You label]
                              [effective streak when > 0]
                                             [lifetime stars]
```

- Equal `friend_rank` values use the same rank treatment; visual order inside a tie
  has no competitive meaning.
- Top-three **rank groups** may receive progressively stronger semantic treatment,
  but never exclusive medal slots.
- Streak and lifetime stars must remain visually distinct. A zero effective streak
  is omitted rather than rendered as an accusation of inactivity.
- No row shows invented rank movement. Accepted-friend overflow actions are Remove
  Friend and Block; the current-user row has no relationship menu.
- A subtle ladder rail is allowed if it remains decorative and hidden from assistive
  technology. Dense rows, typography, and rank markers—not stacked decorative cards—
  must create the competitive character.

### 5.3 Request hierarchy and privacy

Incoming requests are action surfaces outside the ranked ladder. Each shows the
requester avatar/name and sent/expiry context, with Accept as primary, Reject as
secondary, and Block in overflow. On narrow screens or with long VI/EN copy, actions
move below the name rather than squeezing it.

Outgoing requests are collapsed by default and must never reveal recipient identity.
Because multiple outgoing rows are otherwise indistinguishable, the collapsed header
shows the count. Expanded rows use a neutral ordinal plus creation/expiry timestamps
(for example, `Pending request 2`), and Cancel confirmation repeats that timestamp.
Do not invent a recipient name, avatar, code fragment, or challenge label.

The Rank-tab badge and Friends-segment badge both show the exact inbound count `1–50`;
zero removes the badge. Their accessibility labels include the localized count. An
outgoing request never increments either badge.

### 5.4 Add Friend sheet

The sheet has two jobs and one reading order: share my code, then enter another code.
The six visible character cells may be decorative, but input must be backed by one
real, visibly labelled text field so paste, selection, keyboard focus, autofill, and
screen readers remain reliable. Normalize trim + uppercase; do not silently replace
an invalid alphabet character.

Copy and Share are ordinary secondary actions. Rotate is destructive because it
invalidates previously shared codes; place it in overflow and require confirmation.
Block, Remove Friend, Cancel Request, and Rotate use explicit confirmations. Accept
and Reject do not require an extra confirmation.

The sheet remains open for errors, limits, and rate limiting. `RATE_LIMITED` displays
the rounded-up retry time from `retry_after_seconds`; it is not a live countdown unless
the implementation owns timer cleanup and foreground correction. `PENDING` shows a
success result in place. `ACCEPTED` may close the sheet only after the dashboard and
pending-count invalidations have begun.

### 5.5 Visible-state matrix

| Feature | Loading | Empty | Error | Success | Partial / mutation |
|---|---|---|---|---|---|
| Friends root | Race-ladder skeleton with stable geometry | Warm invite state with Add Friend CTA | First-load retry surface; never “no friends” | Summary, requests, ladder | Cached content stays visible beneath stale/offline banner |
| Competition summary | Skeleton values, disabled Add Friend only if auth unavailable | `Rank #1 of 1` is not celebrated as a win; prompt to invite | Included in root error | Truthful lead/tie/target copy | Refresh indicator does not replace cached values |
| Incoming requests | Header/rows included in root skeleton | Section omitted | Cached rows remain actionable only when mutation connectivity is available | Expanded rows | Only the exact mutating row/actions are disabled and marked busy |
| Race ladder | Bounded row skeletons | Invite state when self is the only participant | Root retry or stale banner | Tied rank groups + highlighted self | Self-only ladder may coexist with incoming/outgoing requests |
| Outgoing requests | Count placeholder only when no cache | Section omitted | Cached rows remain visible; cancel disabled offline | Collapsed count, expandable rows | Pending-only is not treated as accepted-empty failure |
| Add Friend sheet | Code action skeleton; entry remains labelled | No special empty state | Inline unavailable/retry result | Copy/share/request result | Rate limit, friend cap, pending cap, or exact action busy state |

Additional combinations that require explicit designs:

1. accepted-empty with no pending requests;
2. accepted-empty with incoming only;
3. accepted-empty with outgoing only;
4. incoming + accepted + outgoing;
5. cached data refreshing;
6. offline with cache;
7. offline without cache;
8. backend unavailable (`PGRST202`/missing RPC included);
9. rate limited with retry time;
10. friend or pending cap reached;
11. one row mutating while other rows remain usable;
12. long names and long localized actions on the narrowest supported screen.

### 5.6 User journey and emotional contract

| Step | User action | Intended feeling | UI support |
|---|---|---|---|
| 1 | Opens Rank | Oriented | Global remains default; inbound badge makes Friends discoverable |
| 2 | Opens Friends | Competitive but truthful | Compact status first; no fake podium or season |
| 3 | Has no friends | Invited, not judged | Race-start empty state and one Add Friend CTA |
| 4 | Shares/enters a code | In control | Clear two-part sheet and persistent inline result |
| 5 | Receives a request | Safe | Requester identity, explicit consent, accessible block path |
| 6 | Gets accepted | Rewarded | Ladder refresh and self/friend comparison; no forced celebration |
| 7 | Returns offline | Reassured | Cached competition remains visible with honest stale status |
| 8 | Hits abuse/cap limits | Informed | Specific limit message and retry time, never generic failure |

Time-horizon rule: within five seconds the user understands their position and next
action; within five minutes they can complete invite/consent; over long-term use the
lifetime ladder remains honest and does not pretend to be a seasonal competition.

### 5.7 Visual-design boundary and Habi alignment

The user owns final visual execution: precise spacing, rank-marker shape, ladder rail,
avatar treatment, illustration choice, and motion polish. The implementation contract
still requires:

- `useTheme()` semantic colors and existing `FontFamily`/`Typography`/`Spacing`/
  `Radii`; no feature-specific hex values or new palette;
- Be Vietnam Pro metrics and bounded VI/EN text;
- theme-safe avatar slots with verified text contrast in light/dark and every accent;
- calm surface hierarchy, few colors, minimal chrome, and no decorative card mosaic;
- no emoji used as production icons; reuse the established icon vocabulary;
- minimum 44-point non-overlapping targets and visible keyboard focus where supported;
- semantic header/list/button/progress state, localized labels/hints, and logical
  screen-reader order;
- selected, expanded, disabled, and busy accessibility states;
- a badge label containing the exact pending count;
- reduced motion disabling entrance/looping effects, with no information encoded only
  by color, position, or animation;
- portrait phone as the primary composition; wider phones/tablets cap content width
  and whitespace rather than stretching rows edge-to-edge;
- bottom-sheet keyboard avoidance, safe-area padding, paste support, and restoration
  of focus to the Add Friend trigger on close.

### 5.8 What already exists and must be reused

- `RankScreen` title, Global rank hero, roadmap, and global leaderboard behavior;
- `useTheme()`, `AppColors`, `FontFamily`, `Spacing`, `Radii`, and existing shadows;
- `TouchableOpacity`, bottom-sheet/modal conventions, `SkeletonRow`, and reduced-motion
  hook patterns already used by Rank;
- existing Rank-tab navigation and tutorial target;
- server-authoritative friend rank, stars, streak, request sections, and pending count.

### 5.9 Explicitly not in scope

- redesigning Global, adding a Global podium, or changing its default selection;
- seasons, weekly/monthly filters, rank-history arrows, or animated live rank changes;
- challenges, wagers, pokes, chat, friend profiles, photos, realtime, or push;
- displaying blocked users or outgoing recipient identity;
- inventing a frontend rank, streak, star total, target, or participant count;
- final visual assets or mockups: the user supplies these from this structural handoff.

### 5.10 UI implementation tasks derived from the stress test

- [ ] **UI-T1 (P1)** — Refactor `RankScreen` so Global and Friends own separate,
  non-nested scroll roots and the segment sits directly below the title.
- [ ] **UI-T2 (P1)** — Implement tie-safe rank groups; test multiple `#1` and `#2`
  rows and prohibit unique medal-slot assumptions.
- [ ] **UI-T3 (P1)** — Implement truthful lead/tie/catch-target copy with no season,
  movement, or finite-progress claims.
- [ ] **UI-T4 (P1)** — Preserve outgoing privacy while making anonymous cancellations
  distinguishable by ordinal and timestamps.
- [ ] **UI-T5 (P1)** — Build the complete visible-state matrix, cached-error behavior,
  and row-scoped mutation disabling.
- [ ] **UI-T6 (P2)** — Make the code entry one accessible real input even if the
  approved design visually splits it into six cells.
- [ ] **UI-T7 (P2)** — Verify light/dark, every user accent, VI/EN long copy, narrow
  phone, wider/tablet width cap, keyboard, screen reader, and reduced motion.

---

## 6. Implementation Tasks

### Task 1: Characterize and extract the existing global leaderboard

**Files:**
- Create: `src/components/LeaderboardSection.tsx`
- Create: `__tests__/LeaderboardSection.test.ts`
- Modify: `src/screens/RankScreen.tsx`

**Interfaces:**
- Consumes: existing `LeaderboardEntry`, `capLeaderboardRows`, and `hasRankGapBefore` from `src/queries/useLeaderboard.ts`.
- Produces: exported `LeaderboardSection` with the same loading/error/empty/content behavior currently embedded in `RankScreen`.

- [ ] Write characterization tests for loading, error distinct from empty, empty current-user fallback, row cap, rank-neighborhood gap, expansion, and current-user visibility.
- [ ] Run `npx jest __tests__/LeaderboardSection.test.ts --runInBand`; expect failures because the extracted module does not exist.
- [ ] Move `LeaderboardRow`, `LeaderboardSection`, their copy types, and their required styles into the new component without changing output or copy.
- [ ] Run the focused test, `npx tsc --noEmit`, and `git diff --check`.
- [ ] Commit only the extraction: `refactor(rank): extract global leaderboard section`.

### Task 2: Add the auth UUID bridge and legacy email reconciliation

**Files:**
- Create: `supabase/migrations/029_social_identity_bridge.sql`
- Create: `supabase/tests/database/029_friends_identity.test.sql`
- Modify: `__tests__/leaderboardCompatibility.test.ts`

**Interfaces:**
- Produces: non-null unique `public.users.auth_user_id`, safe auth insert/email-update reconciliation, and unchanged legacy RPC signatures.

- [ ] Write pgTAP tests for unique backfill, orphan/duplicate aborts, auth insert provisioning, email-change propagation, collision refusal, auth deletion cascade, and released RPC signatures.
- [ ] Run `supabase test db`; expect the new tests to fail before migration 029 is applied.
- [ ] Implement `auth_user_id`, guarded backfill, constraints, and the reconciliation trigger in migration 029; social profile columns belong to migration 030.
- [ ] Run pgTAP plus `npx jest __tests__/leaderboardCompatibility.test.ts --runInBand`.
- [ ] Commit: `feat(auth): bridge social identity to auth uid`.

### Task 3: Implement relationship schema, abuse controls, and RPCs

**Files:**
- Create: `supabase/migrations/030_friend_relationships.sql`
- Create: `supabase/tests/database/030_friend_relationships.test.sql`

**Interfaces:**
- Consumes: `public.users.auth_user_id` from Task 2.
- Produces: schema and exact RPC signatures from §3.

- [ ] Write pgTAP tests for table CHECKs, grants, no direct table access, canonical uniqueness, sequential and concurrent rate-limit behavior, attempt persistence, pruning, code normalization/collision/rotation, self/invalid/blocked privacy, accepted/pending caps, expiry, reciprocal auto-accept, accept/block race precedence, actor authorization, remove/unblock, reset preservation, and delete cascade.
- [ ] Run `supabase test db`; verify the new relationship suite fails.
- [ ] Implement tables, indexes, advisory locks, code generation, transition RPCs, pending cleanup, and account lifecycle changes.
- [ ] Run `supabase test db`; all database tests must pass.
- [ ] Commit: `feat(friends): add secure relationship state machine`.

### Task 4: Add profile v2 freshness and friend dashboard ranking

**Files:**
- Create: `supabase/migrations/031_friend_dashboard.sql`
- Create: `supabase/tests/database/031_friend_dashboard.test.sql`

**Interfaces:**
- Produces: `sync_user_profile_v2`, `get_friend_pending_count`, and `get_my_friend_dashboard` exactly as §3.4.

- [ ] Write pgTAP cases for display-name sanitization, timezone validation, today/yesterday/two-days/null/future freshness, DST boundaries, asymmetric pending disclosure, blocked-row hiding, self inclusion, accepted-only scope, and `DENSE_RANK` ties.
- [ ] Run the focused database suite and verify failure.
- [ ] Implement profile v2 and dashboard functions with owner-timezone freshness.
- [ ] Run all pgTAP tests and inspect function grants from `information_schema.routine_privileges`.
- [ ] Commit: `feat(friends): add freshness gated dashboard`.

### Task 5: Consolidate local profile synchronization

**Files:**
- Modify: `src/api/syncService.ts`
- Modify: `src/queries/useToday.ts`
- Modify if required by verified call sites: `src/queries/useProgress.ts`, `src/queries/useTasks.ts`, `src/queries/useChallenge.ts`, `src/queries/useBackfill.ts`
- Modify: `__tests__/syncService.test.ts`
- Modify: `__tests__/TodayScreen.handleLog.test.ts`

**Interfaces:**
- Consumes: `sync_user_profile_v2` from Task 4.
- Produces: one post-mutation account sync carrying current streak, actual last active date, and local timezone.

- [ ] Add failing tests proving `TASK` and `CHALLENGE` establish freshness, `DAILY_BONUS` does not, deletion can move/clear freshness, RPC v2 receives all fields, and Today performs one sync pipeline rather than two concurrent profile writes.
- [ ] Run `npx jest __tests__/syncService.test.ts __tests__/TodayScreen.handleLog.test.ts --runInBand` and verify the new assertions fail.
- [ ] Implement the SQLite profile query, call v2 after row upload, remove duplicate Today sync, and keep sync failures non-fatal at UI call sites.
- [ ] Run focused tests, full Jest, TypeScript, and `git diff --check`.
- [ ] Commit: `fix(sync): publish deletion-correct friend freshness`.

### Task 6: Add friends transport, pure mapping, and TanStack Query hooks

**Files:**
- Create: `src/api/friendsApi.ts`
- Create: `src/lib/friends.ts`
- Create: `src/queries/useFriends.ts`
- Create: `__tests__/friendsApi.test.ts`
- Create: `__tests__/friends.test.ts`
- Create: `__tests__/useFriends.test.ts`

**Interfaces:**
- Produces: types and functions from §4, plus dashboard/code/pending-count hooks and relationship mutations.

- [ ] Write failing tests for session establishment, no email sent to RPCs, every status mapping, `PGRST202 → UNAVAILABLE`, Unicode initials, localized fallback, deterministic slots 0–5, numeric clamping, stable-sub query keys, lazy dashboard, app-level pending count, account switching, invalidation, retry, and double-submit guards.
- [ ] Run the three focused test files and verify failure.
- [ ] Implement the minimal API, pure helpers, query factory, hooks, and mutations.
- [ ] Run focused tests, full Jest, TypeScript, and `git diff --check`.
- [ ] Commit: `feat(friends): add client data modules`.

### Task 7: Add component test infrastructure and structural UI

**Files:**
- Modify: `package.json`, `package-lock.json`, and `jest.config.js`
- Create: `src/components/friends/FriendsSection.tsx`
- Create: `src/components/friends/FriendRow.tsx`
- Create: `src/components/friends/FriendRequestRow.tsx`
- Create: `src/components/friends/InitialsAvatar.tsx`
- Create: `src/components/friends/AddFriendSheet.tsx`
- Create: `__tests__/FriendsSection.test.tsx`
- Create: `__tests__/AddFriendSheet.test.tsx`
- Modify: `src/config/i18n.ts`

**Interfaces:**
- Consumes: hooks/types from Task 6 and user-supplied visual design.
- Produces: component structure and states from §5 without changing Rank navigation yet.

- [ ] Run `npm install --save-dev --save-exact @testing-library/react-native@14.0.1 react-test-renderer@19.2.3`; keep `react-test-renderer` exactly aligned with the checked-in React `19.2.3`, and update `testMatch` to `['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']`.
- [ ] Write failing interaction tests for the full §5.5 state matrix, tied rank groups, truthful lead/tie/catch-target copy, incoming accept/reject/block, anonymous outgoing cancellation, accepted remove/block, code copy/share/rotate, one-field code normalization, result messages, row-scoped pending actions, accessibility labels/states, and VI/EN long copy.
- [ ] Implement components using only approved theme tokens and the supplied visual design; do not invent final styling.
- [ ] Run component tests, theme contrast tests, localization tests, TypeScript, and `git diff --check`.
- [ ] Commit: `feat(friends): add accessible friend surfaces`.

### Task 8: Integrate Rank segment and app-level badge

**Files:**
- Modify: `src/screens/RankScreen.tsx`
- Modify: `src/navigation/RootNavigator.tsx`
- Create: `__tests__/RankScreen.friends.test.tsx`
- Modify: `__tests__/navigationOptions.test.ts`

**Interfaces:**
- Consumes: extracted `LeaderboardSection`, `FriendsSection`, `AddFriendSheet`, and `useFriendPendingCount`.
- Produces: Global/Friends segment, lazy friend dashboard, sheet ownership, and Rank tab badge at app entry.

- [ ] Write failing tests proving Global remains default and unchanged, the segment sits below the title, Global and Friends use separate non-nested scroll roots, Friends enables dashboard only when selected, pending count loads without mounting RankScreen, foreground refetch occurs, both badges disappear at zero, and AddFriendSheet is a sibling outside both roots.
- [ ] Implement conditional Global/Friends scroll ownership in RankScreen and pending-count/badge ownership in authenticated MainTabs/AppStack.
- [ ] Run focused tests, full Jest, TypeScript, and `git diff --check`.
- [ ] Commit: `feat(rank): integrate friends and request badge`.

### Task 9: Add database CI and deployment compatibility gate

**Files:**
- Create: `supabase/config.toml` if absent through `supabase init`
- Create: `../.github/workflows/supabase-tests.yml`
- Modify: `../Docs/friends_streak_system_plan.md` only if verified implementation signatures differ and the plan must be corrected before release

**Interfaces:**
- Produces: Linux CI that starts local Supabase and runs every pgTAP test before merge.

- [ ] Configure CI to install Supabase CLI `2.107.0`, run `supabase start`, `supabase db reset`, and `supabase test db`, then stop services in an always-run cleanup step.
- [ ] Prove the workflow fails with one intentionally inverted local assertion, restore it, and prove the full suite passes.
- [ ] Verify the new app maps a missing RPC to `UNAVAILABLE`; never deploy a client that renders a missing backend as empty data.
- [ ] Commit: `ci: test friends database contracts`.

### Task 10: Production verification and release gate

**Files:**
- No source changes unless verification finds a defect; any defect starts a focused red-green task before continuing.

- [ ] Apply migrations 029–031 to a scratch Supabase project and run pgTAP/security checks there.
- [ ] Inspect live function signatures, grants, indexes, RLS flags, and backfill counts before applying production migration.
- [ ] Apply the additive migration to production and query-verify it before installing the new client.
- [ ] Run `npx tsc --noEmit`, `npx jest --runInBand`, and `git diff --check`.
- [ ] Build/install a matching debug APK with data-preserving `adb install -r`; never uninstall or clear app data.
- [ ] On two authenticated test accounts, verify request, reciprocal auto-accept, badge at cold entry, accept, reject, cancel, remove, block, unblock, code rotation, caps, rate limit, offline cache, stale banner, and unavailable-backend behavior.
- [ ] Capture fresh emulator screenshots for light/dark, VI/EN, all friend states, long names, reduced motion, and user-selected accent themes.
- [ ] Run `android\gradlew.bat bundleRelease --console=plain` only when the task is explicitly approved for release; verify AAB timestamp/hash before claiming artifact success.

---

## 7. Test Coverage Matrix

```text
Identity
├── unique UUID backfill
├── orphan/duplicate abort
├── email-change reconciliation
└── released RPC compatibility

Relationships
├── request/accept/reject/cancel/remove
├── reciprocal request auto-accept
├── accept-vs-block and unblock-vs-request races
├── actor authorization and blocked precedence
├── 100 accepted / 20 outgoing / 50 incoming caps
└── 30-day expiry and delete cascades

Abuse and privacy
├── atomic 10/hour limiter under concurrency
├── failed attempts commit and old attempts prune
├── malformed/unknown/blocked codes look identical
├── incoming identity disclosed
└── outgoing identity hidden

Freshness and ranking
├── TASK/CHALLENGE only
├── today/yesterday/expired/null/future
├── IANA timezone and DST boundaries
├── deletion-correct local signal
└── accepted-only DENSE_RANK ties

Client and UI
├── session/account query isolation
├── missing RPC/offline/cache/empty distinctions
├── invalidation, retry, double-submit
├── Unicode names/avatar slots/theme contrast
├── VI/EN overflow, 44pt targets, accessibility
└── reduced motion and emulator end-to-end
```

Four regressions are release blockers even if every happy path passes:

1. A failed add-code attempt rolls back and therefore bypasses the rate limit.
2. Offline or missing RPC renders as “no friends.”
3. Outgoing pending reveals the recipient’s identity before acceptance.
4. Deleting the latest local activity leaves the friend appearing active.

---

## 8. Delivery Order and Parallelism

```text
Lane A: Task 1 — global leaderboard characterization/extraction
Lane B: Tasks 2–4 — migration, pgTAP, identity/state/profile contracts
                         │
                         └── backend contract frozen
                                  │
Task 5 — sync v2 ─────────────────┤
Task 6 — client data modules ─────┤
                                  ▼
Task 7 — structural UI after user design handoff
                                  ▼
Task 8 — Rank integration and app badge
                                  ▼
Task 9 — CI compatibility gate
                                  ▼
Task 10 — scratch → production backend → emulator → release
```

Tasks 1 and 2–4 may proceed independently. Task 7 must not begin final visual styling until the user supplies the design treatment listed in §5. Backend deploy precedes client rollout.

---

## 8.1 Executable verification of this contract

An executable reference for §2.2–§3.4 lives in `habit-tracker/supabase/tests/`
and runs on stock PostgreSQL 16 with `auth.uid()` stubbed, so the state machine
can be tested before any Supabase project exists:

```bash
cd habit-tracker/supabase/tests
pip install pgserver "psycopg[binary]" --break-system-packages
python3 run_030_tests.py     # 41/41 passed
```

Confirmed empirically, not by inspection:

- the full §3.2 CHECK matrix — all eight illegal state rows rejected, the legal
  one accepted, non-canonical `user_a_id > user_b_id` rejected, duplicate pair
  rejected;
- reciprocal request upgrades to `accepted` atomically and leaves **exactly one**
  row per pair;
- a blocked target returns `NOT_FOUND`, identical to an unknown code, and only
  the blocker can unblock;
- rate-limit attempts commit even on refusal (`RETURN` rather than `RAISE`);
- `DENSE_RANK` over 100/100/80/50 yields 1/1/2/3;
- freshness gating: active today and yesterday keep the streak, two days ago
  yields 0, and an unrecognised timezone yields 0 even when active today;
- expired pending rows are pruned by the dashboard read;
- deleting the auth user cascades the relationship row.

**The pair advisory lock is load-bearing, and this was measured.** Across 25
concurrent reciprocal-request races: with the lock, 0 failures and every race
resolves to `PENDING` + `ACCEPTED`; with the lock removed and nothing else
changed, `UniqueViolation` is raised. §2.2's claim holds and is not optional.

### Finding R2 — the limiter also charges successful adds

`request_friend_by_code` charges an attempt before the code lookup, so the
10/hour budget is consumed by **valid** adds too. Measured: the 1st–10th adds
of ten distinct real friends return `PENDING`; the 11th returns
`RATE_LIMITED`.

This is correct for abuse control and wrong for the one moment that matters
most at current scale — a user onboarding a group of classmates or teammates in
a single sitting hits a wall that reads as a bug and has no recovery path
except waiting an hour. Note that the reverse direction is fine: many people
entering *one* shared code each spend their own budget.

Options, in order of preference: count only failed lookups toward the limit and
cap successes separately and higher; or keep one counter but raise it to ~30/h;
or surface `retry_after_seconds` in the UI so the wall is at least legible.
The RPC already returns that field — it is currently unused.

---

## 9. Exit Criteria

The feature is complete only when:

- migrations 029–031 and all pgTAP tests pass in Linux CI and a scratch project;
- production schema/grants/backfill are query-verified;
- legacy released RPC signatures still work;
- TypeScript, complete Jest/RNTL, and `git diff --check` pass;
- two-account emulator flows pass without clearing existing SQLite data;
- light/dark, VI/EN, reduced motion, long text, accessibility, and selected accent themes are visually checked;
- backend-unavailable and offline states are distinguishable from an empty friend list;
- the user-approved visual design is implemented without hardcoded theme values;
- an explicit release request has been made before building or publishing a release artifact.

The main product risk after technical completion is adoption, not correctness: at the current population, most users will initially see an empty friend list. Run a small manual invite cohort and measure request acceptance before investing in push, pokes, or deeper social mechanics.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | Not run |
| Codex Review | `/codex review` | Independent second opinion | 0 | — | Not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | REQUIRED | Client/UI architecture review remains before implementation |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAN | Score 6/10 → 9/10; 7 direction decisions absorbed |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Not run |

- **DESIGN PASS 1 — Information architecture:** 6/10 → 10/10 after moving the segment below the title, separating Global/Friends scroll ownership, and defining the first-viewport priority.
- **DESIGN PASS 2 — Interaction states:** 6/10 → 10/10 after adding the visible-state matrix and twelve required combinations.
- **DESIGN PASS 3 — User journey:** 5/10 → 9/10 after defining consent, competition, empty, offline, and limit-state emotional outcomes.
- **DESIGN PASS 4 — AI-slop risk:** 7/10 → 9/10 after rejecting physical podiums, decorative card mosaics, fake movement, seasons, and ornamental competition language.
- **DESIGN PASS 5 — Design-system alignment:** 8/10 → 9/10 with explicit reuse of Habi tokens, typography, Rank patterns, and icon vocabulary.
- **DESIGN PASS 6 — Responsive/accessibility:** 7/10 → 9/10 after specifying virtualized list ownership, one real code input, keyboard/focus behavior, 44-point targets, width caps, VI/EN, themes, and reduced motion.
- **DESIGN PASS 7 — Decisions:** 7 resolved, 0 deferred. Final visual assets remain intentionally user-owned rather than unresolved.

- **NOT IN SCOPE:** Global redesign, unique podium slots, seasons, rank history, challenges, chat/realtime/push, friend profiles/photos, or implementation-supplied final visual assets.
- **WHAT ALREADY EXISTS:** Rank title/Global surfaces, Habi semantic theme and typography tokens, Rank navigation/tutorial target, skeleton/reduced-motion patterns, and server-authoritative social data.
- **IMPLEMENTATION TASKS:** UI-T1 through UI-T7 in §5.10; no separate `TODOS.md` debt was created because all identified work is in current scope.
- **APPROVED MOCKUPS:** None generated; the user owns visual execution from the structural contract.

- **VERDICT:** DESIGN CLEARED at 9/10; client architecture review is still required before implementation.

NO UNRESOLVED DECISIONS
