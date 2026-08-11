# Friends Race Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-safe Friends lifetime-star ladder and complete friend-management flow to Habi's Rank tab using authenticated Supabase data and the approved HTML contract.

**Architecture:** Existing migrations 029–031 remain the backend baseline; one additive migration closes the blocked-account and outgoing-request-block gaps. The Expo client separates RPC transport, pure mapping, TanStack Query state, focused React Native components, and Rank/navigation integration while preserving the existing global leaderboard.

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19.2.3, TypeScript 6, TanStack Query v5, Supabase/PostgreSQL, Jest/ts-jest, React Native Testing Library, PostgreSQL 16 local test runner, Android emulator, Gradle.

## Global Constraints

- This delivery is local-only: do not deploy Supabase migrations or mutate live backend state.
- Never render illustrative friends, scores, streaks, requests, or relationship states.
- Social identity comes from `auth.uid()`; email is used only by `ensureSupabaseSession(currentUserEmail)` and is never sent to social RPCs.
- Keep direct authenticated access to social tables revoked and use narrow `SECURITY DEFINER` RPCs.
- Keep the current Global leaderboard query, privacy mapping, ranking, loading, error, and empty behavior unchanged.
- Key Friends caches by stable Google `sub`; clear separation between signed-in accounts is mandatory.
- Use `useTheme()` semantic colors, `FontFamily` tokens, VI/EN copy, at least 44-point targets, bounded text, and reduced-motion behavior.
- Treat source, local PostgreSQL, emulator, configured backend, and AAB evidence as separate gates.
- Preserve emulator SQLite data; use fresh screenshot and hierarchy evidence before every coordinate-based ADB interaction.
- Preserve unrelated dirty work. Do not stage Challenge changes, parent documentation deletions, `.fallow`, `coverage`, `artifacts`, or unrelated generated files.
- Every production behavior begins with a focused failing test and completes a red-green-refactor cycle.

---

## File Map

```text
supabase/migrations/032_friend_blocked_accounts.sql
  Additive blocked-account read and outgoing-pending block guard.

supabase/tests/run_friends_backend_tests.py
  Applies migrations 029–032 and proves the backend security/state contract locally.

src/api/friendsApi.ts
  Session-before-RPC transport, response validation, status normalization.

src/lib/friends.ts
  Pure row mapping, Unicode initials, avatar slots, invite message, section ordering.

src/queries/useFriends.ts
  Account-scoped query keys, queries, mutations, retry, and exact invalidation.

src/components/LeaderboardSection.tsx
  Existing Global leaderboard presentation extracted without behavior change.

src/components/friends/*
  Friend ladder, request rows, avatars, add/manage sheets, and state surfaces.

src/screens/BlockedAccountsScreen.tsx
  Server-confirmed unblock flow for Settings -> Blocked accounts.

src/screens/RankScreen.tsx
  Global/Friends segment and sheet ownership.

src/navigation/RootNavigator.tsx
  Rank badge, foreground refresh, and Blocked Accounts route.

src/api/syncService.ts
  Publish current streak, deletion-correct activity freshness, and timezone through profile v2.

src/config/appLinks.ts
  Canonical Play Store URL used by the localized invite share message.

src/config/i18n.ts
  Complete Vietnamese and English Friends copy.
```

### Task 1: Prove and close the backend Friends contract

**Files:**
- Create: `supabase/migrations/032_friend_blocked_accounts.sql`
- Modify: `supabase/tests/run_friends_backend_tests.py`
- Existing inputs: `supabase/migrations/029_social_identity_bridge.sql`
- Existing inputs: `supabase/migrations/030_friend_relationships.sql`
- Existing inputs: `supabase/migrations/031_friend_dashboard.sql`
- Existing input: `supabase/tests/requirements.txt`

**Interfaces:**
- Consumes: canonical `friend_relationships` and RPCs from migrations 029–031.
- Produces: `get_my_blocked_accounts()` and a guarded `block_friend(uuid)`.

```sql
get_my_blocked_accounts()
RETURNS TABLE (
  relationship_id uuid,
  display_name text,
  blocked_at timestamptz
)
```

- [ ] **Step 1: Add failing backend checks**

Append migration 032 to `FRIEND_MIGRATIONS` and add checks that the blocker sees only rows they blocked, names are sanitized, rows sort by `updated_at DESC`, non-blockers see nothing, direct table access remains revoked, and an outgoing requester receives `FORBIDDEN` from `block_friend` while the pending row remains unchanged.

```python
checks.equal(
    "outgoing requester cannot block anonymous recipient",
    scalar(cur, "SELECT status FROM block_friend(%s)", (outgoing_id,)),
    "FORBIDDEN",
)
cur.execute("SELECT relationship_id,display_name FROM get_my_blocked_accounts()")
checks.equal("blocked list exposes blocker-owned row", cur.fetchall(), [(blocked_id, "Binh")])
```

- [ ] **Step 2: Run the backend suite and verify RED**

Run: `python supabase/tests/run_friends_backend_tests.py`

Expected: FAIL because migration 032 and `get_my_blocked_accounts()` do not exist.

- [ ] **Step 3: Add the minimal additive migration**

Create migration 032 with `SECURITY DEFINER SET search_path = public, pg_temp`, derive the caller from `auth.uid()`, return only `state='blocked' AND blocked_by=caller_id`, join the other participant's sanitized display name, and order newest first. Replace `block_friend(uuid)` in the additive migration with the same existing transition plus this precondition:

```sql
IF original_relationship.state = 'pending'
   AND original_relationship.requested_by = caller_id THEN
  RETURN QUERY SELECT 'FORBIDDEN'::text;
  RETURN;
END IF;
```

Revoke both signatures from `PUBLIC, anon, authenticated`, then grant only the public RPC signatures to `authenticated`.

- [ ] **Step 4: Run backend GREEN and inspect privileges**

Run: `python supabase/tests/run_friends_backend_tests.py`

Expected: all checks pass, including migrations 029–032, concurrency, privacy, and blocked-account checks.

- [ ] **Step 5: Review and commit only the backend contract**

Run: `git diff --check -- supabase/migrations/029_social_identity_bridge.sql supabase/migrations/030_friend_relationships.sql supabase/migrations/031_friend_dashboard.sql supabase/migrations/032_friend_blocked_accounts.sql supabase/tests`

Commit paths explicitly:

```powershell
git add -- supabase/migrations/029_social_identity_bridge.sql supabase/migrations/030_friend_relationships.sql supabase/migrations/031_friend_dashboard.sql supabase/migrations/032_friend_blocked_accounts.sql supabase/tests
git commit -m "feat(friends): add secure social backend contract"
```

### Task 2: Publish deletion-correct social profile freshness

**Files:**
- Modify: `src/api/syncService.ts`
- Modify: `__tests__/syncService.test.ts`

**Interfaces:**
- Consumes: `sync_user_profile_v2(integer,date,text)` from migration 031.
- Produces: `readSocialProfile(db, userId, timezone)` and one profile-v2 call per account sync.

```ts
export type SocialProfileSignal = {
  currentStreak: number;
  lastActiveLocalDate: string | null;
  timezone: string;
};

export async function readSocialProfile(
  db: SQLiteDatabase,
  userId: number,
  timezone: string,
): Promise<SocialProfileSignal>;
```

- [ ] **Step 1: Write failing freshness tests**

Assert that `TASK` and `CHALLENGE` rows establish `MAX(local_date)`, `LOGIN` and `DAILY_BONUS` do not, deleting the newest qualifying row moves the date backward or to null, and the RPC receives snake-case arguments.

```ts
expect(mockRpc).toHaveBeenCalledWith('sync_user_profile_v2', {
  p_current_streak: 7,
  p_last_active_local_date: '2026-08-10',
  p_timezone: 'Asia/Bangkok',
});
```

- [ ] **Step 2: Verify RED**

Run: `npx.cmd jest __tests__/syncService.test.ts --runInBand`

Expected: FAIL because only `sync_user_profile(integer)` is called.

- [ ] **Step 3: Implement minimal profile-v2 sync**

Read streak from the latest `daily_summary`, freshness with parameterized SQL over `source IN ('TASK','CHALLENGE')`, and the device timezone from `Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh'`. Run profile sync after activity upload so uploaded progress and profile projection converge in one serialized account sync. Keep failures non-fatal only at existing UI fire-and-forget call sites; do not swallow inside `syncToSupabase`.

- [ ] **Step 4: Verify GREEN**

Run: `npx.cmd jest __tests__/syncService.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit the focused sync change**

```powershell
git add -- src/api/syncService.ts __tests__/syncService.test.ts
git commit -m "fix(sync): publish friend streak freshness"
```

### Task 3: Add pure Friends types and RPC transport

**Files:**
- Create: `src/api/friendsApi.ts`
- Create: `src/lib/friends.ts`
- Create: `src/config/appLinks.ts`
- Create: `__tests__/friendsApi.test.ts`
- Create: `__tests__/friends.test.ts`

**Interfaces:**
- Consumes: `supabase`, `ensureSupabaseSession(email)`, and migration 029–032 RPCs.
- Produces: typed API functions and display helpers used by queries/components.

```ts
export type FriendMutationStatus =
  | 'PENDING' | 'ACCEPTED' | 'OK' | 'NOT_FOUND' | 'SELF'
  | 'ALREADY_PENDING' | 'ALREADY_FRIENDS' | 'RATE_LIMITED'
  | 'FRIEND_LIMIT_REACHED' | 'PENDING_LIMIT_REACHED'
  | 'FORBIDDEN' | 'UNAVAILABLE';

export type FriendSection = 'self' | 'accepted' | 'incoming' | 'outgoing';

export type FriendDashboardRow = {
  relationshipId: string | null;
  section: FriendSection;
  playerId: string | null;
  displayName: string | null;
  effectiveStreak: number;
  lifetimeStars: number;
  friendRank: number | null;
  isCurrentUser: boolean;
  createdAt: string | null;
  expiresAt: string | null;
};

export async function fetchFriendDashboard(email: string): Promise<FriendDashboardRow[]>;
export async function fetchFriendCode(email: string): Promise<string>;
export async function fetchFriendPendingCount(email: string): Promise<number>;
export async function fetchBlockedAccounts(email: string): Promise<BlockedAccount[]>;
export async function requestFriend(email: string, code: string): Promise<FriendActionResult>;
export async function respondToFriendRequest(email: string, id: string, action: 'accept' | 'reject'): Promise<FriendActionResult>;
export async function cancelFriendRequest(email: string, id: string): Promise<FriendActionResult>;
export async function removeFriend(email: string, id: string): Promise<FriendActionResult>;
export async function blockFriend(email: string, id: string): Promise<FriendActionResult>;
export async function unblockFriend(email: string, id: string): Promise<FriendActionResult>;
```

- [ ] **Step 1: Write failing transport/helper tests**

Cover session-before-RPC ordering, zero email arguments in social RPC payloads, null/numeric clamping, unknown section rejection, every documented status, `PGRST202`/missing client/network mapping to `UNAVAILABLE`, Unicode initials, deterministic six-slot avatars, six-character normalization, and VI/EN share strings containing the code and canonical store URL.

- [ ] **Step 2: Verify RED**

Run: `npx.cmd jest __tests__/friendsApi.test.ts __tests__/friends.test.ts --runInBand`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement minimal transport and pure helpers**

Every public API method must run:

```ts
await ensureSupabaseSession(currentUserEmail);
const { data, error } = await supabase!.rpc(rpcName, args);
if (error) return orThrowUnavailable(error);
```

Use `PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.habitring.app'` from `src/config/appLinks.ts`. `Share.share` remains a UI responsibility; the helper returns only the complete localized message.

- [ ] **Step 4: Verify GREEN and type safety**

Run: `npx.cmd jest __tests__/friendsApi.test.ts __tests__/friends.test.ts --runInBand`

Run: `npx.cmd tsc --noEmit`

- [ ] **Step 5: Commit the data boundary**

```powershell
git add -- src/api/friendsApi.ts src/lib/friends.ts src/config/appLinks.ts __tests__/friendsApi.test.ts __tests__/friends.test.ts
git commit -m "feat(friends): add typed social API"
```

### Task 4: Add account-scoped TanStack Friends state

**Files:**
- Create: `src/queries/useFriends.ts`
- Create: `__tests__/useFriends.test.ts`

**Interfaces:**
- Consumes: Task 3 API functions.
- Produces: query keys, dashboard/code/pending/blocked hooks, and mutations.

```ts
export const friendKeys = {
  all: (sub: string) => ['friends', sub] as const,
  dashboard: (sub: string) => ['friends', sub, 'dashboard'] as const,
  code: (sub: string) => ['friends', sub, 'code'] as const,
  pendingCount: (sub: string) => ['friends', sub, 'pending-count'] as const,
  blocked: (sub: string) => ['friends', sub, 'blocked'] as const,
};

export function useFriendsDashboard(account: FriendAccount | null, enabled: boolean): UseQueryResult<FriendDashboardRow[]>;
export function useFriendCode(account: FriendAccount | null, enabled: boolean): UseQueryResult<string>;
export function useFriendPendingCount(account: FriendAccount | null): UseQueryResult<number>;
export function useBlockedAccounts(account: FriendAccount | null, enabled: boolean): UseQueryResult<BlockedAccount[]>;
```

- [ ] **Step 1: Write failing query tests**

Prove keys use `sub`, dashboard/code/blocked queries are lazy, pending count starts at authenticated app entry, account switches do not reuse cache, dashboard retry is bounded, cached data remains available on refresh error, and each mutation invalidates only its required keys.

```ts
expect(friendKeys.dashboard('google-sub-1')).toEqual(['friends', 'google-sub-1', 'dashboard']);
expect(invalidated).toEqual([
  friendKeys.dashboard('google-sub-1'),
  friendKeys.pendingCount('google-sub-1'),
]);
```

- [ ] **Step 2: Verify RED**

Run: `npx.cmd jest __tests__/useFriends.test.ts --runInBand`

- [ ] **Step 3: Implement minimal hooks and invalidation**

Use `staleTime: 60_000` for dashboard/pending reads, `retry: 1` for queries, no mutation retry, and mutation variables containing the relationship ID so row-scoped pending state is derivable. Unblock invalidates only blocked accounts; it does not invalidate dashboard or recreate friendship.

- [ ] **Step 4: Verify GREEN**

Run: `npx.cmd jest __tests__/useFriends.test.ts --runInBand`

- [ ] **Step 5: Commit query state**

```powershell
git add -- src/queries/useFriends.ts __tests__/useFriends.test.ts
git commit -m "feat(friends): add account scoped query state"
```

### Task 5: Extract and characterize the existing Global leaderboard

**Files:**
- Create: `src/components/LeaderboardSection.tsx`
- Create: `__tests__/LeaderboardSection.test.tsx`
- Modify: `src/screens/RankScreen.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `jest.config.js`

**Interfaces:**
- Consumes: `LeaderboardEntry`, `capLeaderboardRows`, and `hasRankGapBefore` from `src/queries/useLeaderboard.ts`.
- Produces: `<LeaderboardSection {...existingProps} />` with no visible behavior change.

- [ ] **Step 1: Add aligned component-test dependencies**

Run: `npm.cmd install --save-dev --save-exact @testing-library/react-native@14.0.1 react-test-renderer@19.2.3`

Extend Jest matching to `['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']`; keep `react-test-renderer` exactly aligned with React `19.2.3`.

- [ ] **Step 2: Write failing characterization tests**

Cover loading, refresh error distinct from empty, current-user fallback, row cap, rank gap marker, expand/collapse accessibility state, current-user visibility outside the top block, and the existing streak/gap copy.

- [ ] **Step 3: Verify RED**

Run: `npx.cmd jest __tests__/LeaderboardSection.test.tsx --runInBand`

Expected: FAIL because the extracted component does not exist.

- [ ] **Step 4: Move the existing presentation without redesign**

Move `LeaderboardRow`, `LeaderboardSection`, their prop/copy types, and only the styles they consume. Keep the query in `RankScreen` until Task 9.

- [ ] **Step 5: Verify GREEN and regression safety**

Run: `npx.cmd jest __tests__/LeaderboardSection.test.tsx __tests__/useLeaderboard.test.ts --runInBand`

Run: `npx.cmd tsc --noEmit`

- [ ] **Step 6: Commit the extraction and test tooling**

```powershell
git add -- package.json package-lock.json jest.config.js src/components/LeaderboardSection.tsx src/screens/RankScreen.tsx __tests__/LeaderboardSection.test.tsx
git commit -m "refactor(rank): extract global leaderboard"
```

### Task 6: Add accessible Friends ladder primitives and states

**Files:**
- Create: `src/components/friends/InitialsAvatar.tsx`
- Create: `src/components/friends/FriendRow.tsx`
- Create: `src/components/friends/FriendRequestRow.tsx`
- Create: `src/components/friends/FriendsSection.tsx`
- Create: `__tests__/FriendsSection.test.tsx`

**Interfaces:**
- Consumes: mapped rows and mutations from Tasks 3–4.
- Produces: one non-nested Friends scroll surface with ladder/request actions.

- [ ] **Step 1: Write failing component tests**

Cover first-load spinner, first-load unavailable, empty accepted set, stale cached banner, self inclusion, tied dense ranks, effective streak, lifetime stars, incoming identity/actions, anonymous outgoing rows, row-scoped disabled actions, remove/block confirmations, long VI/EN names, `numberOfLines`, accessibility roles/labels/states, and 44-point controls.

- [ ] **Step 2: Verify RED**

Run: `npx.cmd jest __tests__/FriendsSection.test.tsx --runInBand`

- [ ] **Step 3: Implement minimal theme-aware components**

`FriendRow` exposes a single accessible row stop; action menus open from one 44-point button. `InitialsAvatar` is `accessible={false}` when adjacent text announces the name. Use semantic theme tokens and `FontFamily`; do not copy fixed HTML colors.

- [ ] **Step 4: Verify GREEN**

Run: `npx.cmd jest __tests__/FriendsSection.test.tsx --runInBand`

Run: `npx.cmd tsc --noEmit`

- [ ] **Step 5: Commit ladder primitives**

```powershell
git add -- src/components/friends/InitialsAvatar.tsx src/components/friends/FriendRow.tsx src/components/friends/FriendRequestRow.tsx src/components/friends/FriendsSection.tsx __tests__/FriendsSection.test.tsx
git commit -m "feat(friends): add accessible friend ladder"
```

### Task 7: Add code sharing and relationship management sheets

**Files:**
- Create: `src/components/friends/AddFriendSheet.tsx`
- Create: `src/components/friends/FriendActionSheet.tsx`
- Create: `__tests__/AddFriendSheet.test.tsx`
- Create: `__tests__/FriendActionSheet.test.tsx`

**Interfaces:**
- Consumes: friend code and mutations from Task 4; invite message helper from Task 3.
- Produces: add/copy/share/rotate and confirm/cancel/remove/block UI.

- [ ] **Step 1: Write failing sheet tests**

Cover six-character uppercase normalization, invalid length, typed statuses, rate-limit seconds, copy feedback, `Share.share({message})`, rotation confirmation, keyboard dismissal, focus return, mutation double-submit prevention, remove/block confirmations, cancel, Android back close, and localized long copy.

```ts
expect(Share.share).toHaveBeenCalledWith({
  message: expect.stringContaining('K7M2QX'),
});
expect(Share.share).toHaveBeenCalledWith({
  message: expect.stringContaining('https://play.google.com/store/apps/details?id=com.habitring.app'),
});
```

- [ ] **Step 2: Verify RED**

Run: `npx.cmd jest __tests__/AddFriendSheet.test.tsx __tests__/FriendActionSheet.test.tsx --runInBand`

- [ ] **Step 3: Implement sheets with real hook state**

Use React Native `Share.share`, the project's clipboard dependency, controlled input capped at six allowed characters, and non-optimistic destructive transitions. Modal content uses selected theme tokens and returns focus to the launching control when closed.

- [ ] **Step 4: Verify GREEN**

Run: `npx.cmd jest __tests__/AddFriendSheet.test.tsx __tests__/FriendActionSheet.test.tsx --runInBand`

- [ ] **Step 5: Commit sheet flows**

```powershell
git add -- src/components/friends/AddFriendSheet.tsx src/components/friends/FriendActionSheet.tsx __tests__/AddFriendSheet.test.tsx __tests__/FriendActionSheet.test.tsx
git commit -m "feat(friends): add friend management sheets"
```

### Task 8: Add Blocked Accounts route and unblock flow

**Files:**
- Create: `src/screens/BlockedAccountsScreen.tsx`
- Create: `__tests__/BlockedAccountsScreen.test.tsx`
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `__tests__/navigationOptions.test.ts`

**Interfaces:**
- Consumes: `useBlockedAccounts` and `unblockFriend` from Task 4.
- Produces: Settings -> Blocked Accounts route matching the block confirmation promise.

- [ ] **Step 1: Write failing route/screen tests**

Cover route registration, settings entry, loading, unavailable, nobody-blocked, newest-first rows, unblock confirmation, disabled pending row, no optimistic removal, server-confirmed disappearance, failed-unblock retention, and the statement that friendship is not restored.

- [ ] **Step 2: Verify RED**

Run: `npx.cmd jest __tests__/BlockedAccountsScreen.test.tsx __tests__/navigationOptions.test.ts --runInBand`

- [ ] **Step 3: Implement the focused screen and route**

Add `BlockedAccounts` to the authenticated stack with the same modal header conventions as Settings. The screen queries only when mounted and refetches its own key after confirmed unblock.

- [ ] **Step 4: Verify GREEN**

Run: `npx.cmd jest __tests__/BlockedAccountsScreen.test.tsx __tests__/navigationOptions.test.ts --runInBand`

- [ ] **Step 5: Commit blocked-account management**

```powershell
git add -- src/screens/BlockedAccountsScreen.tsx src/screens/SettingsScreen.tsx src/navigation/RootNavigator.tsx __tests__/BlockedAccountsScreen.test.tsx __tests__/navigationOptions.test.ts
git commit -m "feat(settings): add blocked accounts"
```

### Task 9: Integrate Friends into Rank, navigation badge, and localization

**Files:**
- Modify: `src/screens/RankScreen.tsx`
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/config/i18n.ts`
- Create: `__tests__/RankScreen.friends.test.tsx`
- Create: `__tests__/friendsI18n.test.ts`

**Interfaces:**
- Consumes: Global component, Friends components, queries, and sheets from Tasks 4–8.
- Produces: complete `Global | Friends` Rank experience and pending badge.

- [ ] **Step 1: Add complete VI/EN key coverage tests**

Define and assert both locales contain the same Friends keys, including segments, summaries, requests, statuses, confirmations, unavailable/stale/empty copy, share copy, blocked accounts, accessibility labels, and retry actions. Assert no value is blank and Vietnamese/English button labels remain bounded in component tests.

- [ ] **Step 2: Add failing integration tests**

Prove Global is default, Global behavior remains present, Friends dashboard is enabled only when selected, sheets are siblings outside scroll roots, pending count loads before Rank mounts, badge is absent at zero, count caps visually at `99+`, and `AppState` foreground invalidates pending count.

- [ ] **Step 3: Verify RED**

Run: `npx.cmd jest __tests__/RankScreen.friends.test.tsx __tests__/friendsI18n.test.ts __tests__/navigationOptions.test.ts --runInBand`

- [ ] **Step 4: Implement integration with separate scroll ownership**

Keep the existing Rank hero/gallery above or within the Global surface exactly as approved by the HTML contract; place the segment below the title and avoid nesting a virtualized Friends list inside the existing Global `ScrollView`. `MainTabs` receives the authenticated account and owns `useFriendPendingCount` plus foreground refresh so the badge exists before RankScreen mounts.

- [ ] **Step 5: Verify GREEN and full code gate**

Run: `npx.cmd jest __tests__/RankScreen.friends.test.tsx __tests__/friendsI18n.test.ts __tests__/navigationOptions.test.ts --runInBand`

Run: `npx.cmd tsc --noEmit`

Run: `npx.cmd jest --runInBand`

Run: `git diff --check`

- [ ] **Step 6: Commit integration only**

```powershell
git add -- src/screens/RankScreen.tsx src/navigation/RootNavigator.tsx src/config/i18n.ts __tests__/RankScreen.friends.test.tsx __tests__/friendsI18n.test.ts __tests__/navigationOptions.test.ts
git commit -m "feat(rank): integrate friends race ladder"
```

### Task 10: Review, emulator QA, release AAB, and final focused commit

**Files:**
- Modify only when a reproduced defect begins a new focused failing test.
- Save QA evidence under: `.visual-verify/friends-race/`
- Verify artifact: `android/app/build/outputs/bundle/release/app-release.aab`

**Interfaces:**
- Consumes: complete local implementation.
- Produces: separate code, backend-local, runtime, visual, and release evidence.

- [ ] **Step 1: Re-check scope before verification**

Run `git status --short`, `git diff --stat`, `git diff`, and `git diff --cached`. Confirm every Friends file is intentional and every unrelated path remains excluded. If a target file changed concurrently, stop editing it and re-read its exact diff.

- [ ] **Step 2: Run the fresh code/backend gate**

```powershell
python supabase/tests/run_friends_backend_tests.py
npx.cmd tsc --noEmit
npx.cmd jest --runInBand
git diff --check
```

Expected: exit 0 for every command and zero Jest failures. Record actual suite/test totals and backend check totals.

- [ ] **Step 3: Build and data-preservingly install debug**

Use the Android emulator QA workflow. Confirm package, device, ABI, and current screenshot/hierarchy before input. Build an ABI-matched debug APK and use `adb install -r`; never uninstall, clear app data, or delete SQLite/WAL/SHM files.

- [ ] **Step 4: Verify source-backed local-only runtime states**

Because migrations are not deployed, verify Global remains functional and Friends renders the honest unavailable state against the configured backend. If the configured backend independently already has the RPCs, exercise real authenticated rows; do not seed fake production UI data. Verify VI/EN, at least one light and one dark selected theme, long labels, font scaling, accessibility hierarchy, Android back/reopen, and reduced-motion behavior. Save fresh screenshots and hierarchy dumps under `.visual-verify/friends-race/`.

- [ ] **Step 5: Build and verify release AAB**

```powershell
$env:EXPO_METRO_MAX_WORKERS = '1'
Set-Location android
.\gradlew.bat bundleRelease --console=plain
Set-Location ..
Get-Item android\app\build\outputs\bundle\release\app-release.aab | Format-List FullName,Length,LastWriteTime
Get-FileHash android\app\build\outputs\bundle\release\app-release.aab -Algorithm SHA256
```

Expected: Gradle exit 0 and a non-empty AAB with fresh timestamp/hash.

- [ ] **Step 6: Run a final five-dimension UI audit**

Score accessibility, performance, responsive layout, theming, and anti-patterns only from source plus fresh emulator evidence. Fix any P0–P2 defect through a new failing test and repeat Steps 2–5 as affected.

- [ ] **Step 7: Create the final focused commit if verification repairs exist**

Stage only verified Friends repair paths. Inspect `git diff --cached --name-status` and `git diff --cached` before commit.

```powershell
git commit -m "fix(friends): close release verification gaps"
```

Skip this commit when no repair files remain; do not create an empty commit.

- [ ] **Step 8: Report evidence boundaries**

Report code gate, local PostgreSQL backend tests, emulator route/state/locale/theme, configured-backend availability, AAB path/size/hash, commit IDs, unrelated work preserved, and the explicit fact that no Supabase deployment occurred.

---

## Self-Review Result

- Spec coverage: every approved scope item maps to Tasks 1–10, including blocked accounts, profile freshness, Global preservation, UI states, localization, navigation badge, emulator QA, and release AAB.
- Type consistency: `FriendMutationStatus`, `FriendDashboardRow`, `FriendAccount`, `friendKeys`, and RPC signatures are defined once and consumed consistently by later tasks.
- Scope boundary: deployment, realtime, notifications, chat, photos, deep links, and alternate race windows remain excluded.
- Placeholder scan: no deferred requirements or undefined implementation steps remain.
