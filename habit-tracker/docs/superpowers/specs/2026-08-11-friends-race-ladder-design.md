# Friends Race Ladder Design

## Goal

Implement the approved `Friends Race Ladder.html` experience inside Habi's Rank tab without replacing the existing global leaderboard. Friends data is real, authenticated, and server-authoritative; the client must never invent friend rows, streaks, stars, requests, or relationship states.

This delivery is local-only. It may add and validate additive Supabase migrations, client code, tests, an emulator build, and a release AAB, but it must not deploy migrations or change live Supabase state. Live Friends runtime verification remains unavailable until the required migrations are deployed separately.

## Product Scope

The Rank screen owns a theme-aware `Global | Friends` segment. Global preserves the current lifetime leaderboard behavior. Friends provides:

- the signed-in user's row and accepted-friend ladder, ranked by lifetime stars;
- effective streak and lifetime-star summaries;
- persistent six-character friend-code creation, copy, share, and rotation;
- incoming and outgoing request management;
- accept, reject, cancel, remove, block, and unblock flows;
- an authenticated Rank-tab badge for incoming requests;
- loading, empty, stale-cache, offline, unavailable, and mutation-pending states;
- Vietnamese and English copy, selected user themes, reduced motion, and accessible controls.

Push notifications, realtime subscriptions, chat, photos, deep links, and weekly/monthly race windows are out of scope. "Race" means the accepted-friend lifetime-star ladder defined by the supplied HTML; it does not introduce a second scoring system.

## Architecture

Supabase remains the authority for social identity, consent, privacy, relationship transitions, effective streak projection, and friend rank. Existing uncommitted migrations `029_social_identity_bridge.sql`, `030_friend_relationships.sql`, and `031_friend_dashboard.sql` are treated as the baseline contract and are not rewritten by the client implementation.

Any backend contract missing from the HTML is added in a new additive migration. In particular, the blocked-account screen requires `get_my_blocked_accounts()` to return the caller-visible relationship ID, display name, and block timestamp. The migration also prevents a requester from converting their own outgoing anonymous pending request into a blocked relationship. Direct authenticated table access remains revoked; all social reads and writes use narrowly scoped `SECURITY DEFINER` RPCs derived from `auth.uid()`.

The client boundary is:

```text
Supabase RPCs
  -> src/api/friendsApi.ts
  -> src/queries/useFriends.ts
  -> FriendsSection and focused rows/sheets
  -> RankScreen segment and RootNavigator badge
```

`friendsApi.ts` owns RPC transport, remote row types, response validation, expected-status normalization, and unavailable-error mapping. `useFriends.ts` owns account-scoped query keys, caching, mutation state, and exact invalidation. UI components receive display-ready typed data and callbacks; they do not call Supabase directly.

The current global leaderboard section is extracted behind a component boundary without changing its query, ranking, privacy behavior, or empty/error semantics.

## Identity and Data Flow

All Friends queries are keyed by the stable Google account `sub`, while the current email is used only to establish Habi's intentionally non-persistent Supabase session before an RPC. Email is never sent as a social identity argument.

At authenticated app entry, the pending-count query loads for the Rank-tab badge and refreshes when the app returns to the foreground. Opening Friends loads the dashboard. Opening Add Friend loads or creates the caller's persistent code. Opening Blocked Accounts loads the dedicated blocked-account RPC.

Dashboard rows are partitioned into self, accepted, incoming, and outgoing sections. Outgoing pending rows remain anonymous until acceptance. Accepted rank uses the server's dense lifetime-star rank over exactly the caller and accepted friends. Effective streak is returned by the server's freshness-gated calculation; the UI does not reinterpret stored streak values.

Mutations disable only the affected relationship action. On confirmed success, the smallest relevant queries are invalidated. Destructive-looking relationship transitions are never optimistically removed. Cached dashboard data remains visible if a refresh fails and is marked stale.

## UI Contract

The supplied HTML is the visible interaction contract, adapted to React Native and Habi's existing layout tokens rather than copied as fixed web pixels.

- Use `useTheme()` semantic colors and `FontFamily` tokens for every user-selectable theme.
- Preserve the Rank tab and existing global rank/mascot/gallery behavior.
- Keep all interactive targets at least 44 points, with explicit roles, labels, states, and hints where needed.
- Bound VI/EN names, request metadata, error copy, and button labels for narrow Android widths and font scaling.
- Respect reduced motion for entrances, sheet transitions under app control, and any decorative animation.
- Keep ladder meaning visible without color alone through rank numbers, labels, and icons.
- Use React Native `Share.share({ message })` for the complete localized invite message. Copy copies only the six-character code.
- Block and remove actions require confirmation. Unblock waits for server confirmation and does not recreate friendship.

Initials avatars are deterministic from server-visible names and theme-compatible palette slots. They are decorative when the adjacent row already exposes the name, avoiding duplicate screen-reader announcements.

## Failure and Privacy Behavior

Missing RPCs, `PGRST202`, session establishment failure, and unavailable Supabase map to a dedicated Friends-unavailable state. A failed first load is never rendered as an empty friend list. A failed refresh keeps cached data visible with retry affordance.

Expected business outcomes such as invalid code, self-request, already pending, already friends, capacity limits, rate limits, forbidden transitions, and unavailable service map to localized inline feedback. Unexpected errors are sanitized and do not expose email, auth UUID, raw SQL, or relationship internals.

The client never receives email, recipient identity for outgoing pending requests, timezone, raw freshness date, or blocker identity. Blocked relationships are absent from the main dashboard and appear only through the caller-authorized blocked-account RPC.

## Test Strategy

Implementation follows red-green-refactor for new behavior.

- Pure tests cover Unicode initials, deterministic avatar slots, row mapping, status normalization, invite-message construction, expiry metadata, and section ordering.
- API/query tests cover session-before-RPC ordering, account-scoped keys, unavailable mapping, cache retention, exact invalidation, foreground pending refresh, and double-submit prevention.
- Component tests cover Global/Friends switching, loading/empty/stale/error states, incoming/outgoing privacy, add/share/copy/rotate feedback, confirmations, long VI/EN labels, accessibility metadata, and blocked-account behavior.
- Navigation tests cover the pending badge and account-switch cache separation.
- Backend tests apply migrations locally and verify RPC privileges, canonical relationships, race handling, capacity/rate limits, privacy projections, dense rank, effective streak, blocked-account reads, and forbidden outgoing-request blocks.

The full code gate is TypeScript, Jest in-band, backend migration tests, and `git diff --check`. Emulator QA uses a data-preserving install and fresh screenshot/hierarchy evidence for both locales and representative light/dark selected themes. Because this delivery does not deploy Supabase, authenticated live Friends data on the emulator is reported as blocked unless the configured backend already exposes the contract independently.

## Delivery Boundary

The release gate builds `android/app/build/outputs/bundle/release/app-release.aab` with `EXPO_METRO_MAX_WORKERS=1` and verifies its metadata. The AAB proves packaging only; it does not prove backend deployment or live Friends data.

The implementation commit includes only Friends-related source, tests, additive migrations, documentation, and deliberate configuration updates. Existing Challenge changes, deleted parent documentation, `.fallow` files, coverage, artifacts, and other unrelated dirty work remain untouched and unstaged by this work.

## Acceptance Criteria

1. Rank exposes working Global and Friends segments while Global behavior remains unchanged.
2. Every Friends surface consumes authenticated RPC data and contains no illustrative player or score data.
3. All relationship and blocked-account actions match the privacy and consent rules above.
4. VI/EN, selected themes, reduced motion, accessibility, loading, empty, stale, error, and retry states are implemented.
5. Focused tests demonstrate each new behavior through a failing test before production code.
6. Full TypeScript, Jest, backend-local, diff-hygiene, emulator, and release-AAB gates are run and reported separately.
7. No Supabase deployment occurs in this delivery.
8. Unrelated dirty and staged work is preserved and excluded from Friends commits.
