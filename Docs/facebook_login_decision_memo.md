# Facebook Login — Decision Memo

**Status:** Recommend **do not build** in current form. Two of the three stated
requirements are not achievable against the shipped schema and Meta's current
policy. A cheaper alternative that serves the actual goal is proposed in §5.

**Stated goal:** import a user's Facebook friends into Habi's friends list.
**Stated collision policy:** a Google account and a Facebook account sharing an
email should remain two separate Habi accounts.

---

## 1. Blocker A — "two separate accounts" is impossible in the shipped schema

`supabase/migrations/002_create_users_table.sql`:

```sql
user_email    TEXT NOT NULL UNIQUE,
```

`029_social_identity_bridge.sql` additionally enforces a one-to-one mapping
between `public.users.auth_user_id` and `auth.users.id`, and its own guard
raises `Cannot backfill auth UUIDs: duplicate normalized public.users emails`
if that invariant is ever violated.

Consequence: if a user signs in with Facebook using an email that already
exists in `public.users`, the very first call to `sync_user_profile_v2()`
(`src/api/syncService.ts:255`) executes:

```sql
INSERT INTO public.users (user_email, auth_user_id, ...) VALUES (caller_email, caller_id, ...)
ON CONFLICT (auth_user_id) DO UPDATE ...
```

The `ON CONFLICT` target is `auth_user_id`, **not** `user_email`. A new auth
UUID with an existing email therefore does not take the DO UPDATE branch — it
attempts a genuine INSERT and violates the `user_email` UNIQUE constraint.

The user's symptom is not a nice error message. It is: sign-in succeeds, the
app looks fine, and then profile sync, the friend dashboard, the leaderboard,
and all remote progress silently fail forever for that account. This is a worse
outcome than any of the options considered.

Making "two separate accounts" actually work requires dropping the
`user_email` UNIQUE constraint and re-keying every email-addressed RPC
(`ensureSupabaseSession(email)`, `pauseAccountSync(email)`,
`resetUserProgressInSupabase(email)`, `deleteUserFromSupabase(email)`) onto
`auth_user_id`. That is an identity-layer migration on a live Play Store
release, not a feature.

## 2. Blocker B — Supabase would merge the accounts anyway

Supabase Auth performs automatic identity linking when a second provider
returns the **same verified email**. Facebook returns a verified email for
most accounts. So the default platform behaviour is the *opposite* of the
chosen policy: one `auth.users` row, two identities.

This means the chosen collision policy is not merely expensive — it must be
actively fought at two independent layers (Postgres constraint + Supabase
Auth config) to produce an outcome that, per §1, breaks the app.

**Note the silver lining:** automatic linking is arguably the *correct*
behaviour for a gamified app. One account, one streak, one rank. If Facebook
login is ever built, accept the linking rather than defeating it.

## 3. Blocker C — `user_friends` does not return what you expect

Meta's `user_friends` permission returns only friends who have **also
installed this same app and also granted `user_friends`**. It has not returned
a user's full friend list since Graph API v2.0 (2014).

For Habi's current install base the expected yield is effectively zero, and it
stays near zero until the app is already large — i.e. the permission only pays
off after you no longer need it. On top of that:

- `user_friends` requires **App Review**.
- Meta now requires **Business Verification** even for baseline `email` /
  `public_profile` in production. Timeline is weeks, and it needs a verifiable
  business entity, a hosted Privacy Policy, and a Data Deletion Callback URL.

## 4. Blocker D — it contradicts the friends system's stated privacy design

The existing friend system (migrations `030`–`033`, `src/lib/friends.ts`) is
deliberately privacy-preserving:

- 6-character friend code, alphabet excludes `I L O 0 1`
- outgoing requests render as an **ordinal**, never a name — the code comment
  is explicit that "the recipient must stay unidentifiable until they accept"
- requests expire (`expires_at`), are rate limited (`RATE_LIMITED`), and are
  capped (`FRIEND_LIMIT_REACHED`, `PENDING_LIMIT_REACHED`)
- a block list exists (`032_friend_blocked_accounts.sql`)

A social-graph import inverts every one of those decisions. It would need its
own privacy review, its own consent screen, and an updated Play Data Safety
declaration.

Secondary, but real: `supabase.auth.signInWithIdToken({ provider: 'facebook' })`
has known nonce-mismatch and token-parsing issues in React Native. The likely
fallback is `signInWithOAuth` (browser redirect), which is a visibly worse UX
than the current native one-tap Google flow.

---

## 5. Recommended alternative — deep-link friend invite

The real goal is *friend acquisition*, and there is a path to it that costs
about one to two days and needs zero App Review, zero schema change, and zero
new identity provider.

Everything required already exists in the project:

| Requirement | Already present |
|---|---|
| Custom URL scheme | `app.json` → `"scheme": "habittracker"` |
| Android intent filter | `app.json` → `intentFilters` for `habittracker://` |
| Native share sheet | `expo-sharing` in `package.json` + `plugins` |
| Shareable image card | `src/components/ShareCard.tsx` + `react-native-view-shot` |
| Friend code + redeem UI | `AddFriendSheet.tsx`, `filterFriendCodeInput()` |

**Scope:**

1. Build an invite link `habittracker://friend?code=XXXXXX` from the user's
   own friend code.
2. Handle the incoming link in `RootNavigator.tsx` → open `AddFriendSheet`
   with the code pre-filled and validated through the existing
   `filterFriendCodeInput()`, so no new validation path is introduced.
3. Add a "Mời bạn bè" action that calls `expo-sharing` with the link, or with
   the existing share card image plus the link as the message body.
4. Optional web fallback page so a link opened outside Android still resolves
   to the Play Store listing.

**Why this beats Facebook friend import:** it reaches Messenger, Zalo, TikTok
DMs, and group chats — which is where Vietnamese Gen Z actually coordinates —
instead of only reaching Facebook friends who already installed Habi.

**Risks to handle:** rate-limit invite sends the same way friend requests are
already limited; a shared link is a bearer token for a friend request, so
confirm the existing friend-code rotation story covers a leaked link.

---

## 6. If Facebook login is built anyway — required order of work

Do not start at the sign-in button. The button is the last 10%.

1. Migration: drop `user_email` UNIQUE, re-key all email-addressed RPCs onto
   `auth_user_id`, keep the v2 RPCs alive for the released client.
2. Decide and document the linking policy — recommendation: **accept**
   Supabase automatic linking (one account, identities linked), which removes
   most of §1's work.
3. `resolveUserRow()` in `src/hooks/useAuth.ts`: replace the `google_sub`
   lookup with `(provider, provider_sub)`, plus a local SQLite migration in
   `src/db/migrations.ts`.
4. Meta setup: Business Verification, App Review, Data Deletion Callback URL,
   Privacy Policy URL.
5. Play Console Data Safety re-declaration.
6. Only then: the sign-in button and `SignInScreen` UI.

Steps 1–3 are the load-bearing work and carry the entire regression risk for
existing signed-in users. Steps 4–5 are calendar time you cannot compress.
