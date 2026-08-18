# Avatar System — Implementation Plan (rev. 3)

**rev. 3 changes:** all customization items are **free and ungated**; the editor
lives in a Personalization entry point on `ProfileScreen`, not in onboarding.
This removes the unlock economy from rev. 2 and adds one hard art constraint
(§3) without which the free model breaks the friends ladder.

**rev. 2 established:** the avatar is the user's Nova, not a human face — Habi
already owns a parametric SVG mascot engine (`src/config/ranks.config.ts`,
`src/components/RankMascot.tsx`) and a second art language would compete with it.

---

## 1. What the user owns vs. what the user earns

| Layer | Owner | Source |
|---|---|---|
| body `geometry` (outer, innerRatio) | **earned, automatic** | `tier` |
| sharpness / glow / `bodyStyle` | **earned, automatic** | `tier` |
| band pips (0–4) | **earned, automatic** | `band` |
| idle animation signature | **earned, automatic** | `tier` |
| ambient FX | **earned, automatic** | `tier` |
| accent hue | free choice | user |
| face / expression | free choice | user |
| `front` charm (1 slot) | free choice | user |
| `back` motif (1 slot) | free choice | user |
| background disc | free choice | user |

Nothing in the right column is ever locked, purchased, or earned.

**This is consistent with design principle #1, not a violation of it.**
*"Earn your delight — rewards fire only for real achievements, never as
decoration."* Decoration is precisely what the right column is. Turning
decoration into a reward would be the violation. The left column is the
achievement layer, and it is already fully automatic — a user cannot pick it,
buy it, or opt out of it. Status is expressed by the parts they don't control.

**Objection considered:** "if the body is rank-derived, a user who ranks down
loses the look they got attached to." Does not happen —
`habit_tracker_schema.md` documents `users.current_tier_id` as a high-water
mark: *"only ever advances."*

## 2. Config string

```
v1:hu3.fc02.ch05.au01.bg2
```

`hu` hue · `fc` face · `ch` front charm · `au` back motif · `bg` background disc.
Five user-owned fields. **No tier field** — tier is derived, never declared.

Tier derivation is still required even with everything free, because the body
comes from it. `get_my_friend_dashboard()` already returns `lifetime_stars` for
every friend (`RemoteFriendDashboardRow` in `src/lib/friends.ts`), and
`public.users.lifetime_stars` is written only through `sync_lifetime_stars()`,
which migration `021_secure_lifetime_leaderboard.sql` guards as monotonic. So
the viewer's device computes each friend's tier from server-guarded stars using
`ranks.config.ts` thresholds it already holds.

Free items simplify this: there is no entitlement check to write, only the
derivation. What remains is the **forward-compatibility rule**, which is still
load-bearing and must ship in the first release, before any avatar exists in
the wild:

> Unknown id → fall back to index `00` of that category. Unknown version prefix
> → `null` → existing `InitialsAvatar`. Never throw.

## 3. The one hard constraint: the free catalog must be rank-neutral

This is the risk that free customization introduces, and the whole design fails
without it.

`Docs/rank_mascot_implementation_plan.md` assigns specific motifs as **rank
vocabulary**: GOATED = crown + laurel (6C), Final Boss = thorned crown + red
cape (7C), Ascended = two-layer luminous body + glowing core + halo (8A). If a
tier-0 user can freely equip a crown, a cape, or a halo, then the friends ladder
stops being readable — the exact signal Nova exists to carry is destroyed by the
cosmetic layer sitting on top of it.

**Art brief rule:** free items live in a *personality* semantic space, never a
*status* one.

| Allowed (personality) | Forbidden (reserved rank vocabulary) |
|---|---|
| headphones, glasses, bandana, cap | any crown, tiara, or diadem |
| book, coffee cup, dumbbell, plant | laurel wreath, wings, cape |
| flower, star sticker, small pet | halo, glowing core, radiating rays |
| pattern / texture motifs behind the body | any additive glow (glow encodes tier) |

Two mechanical corollaries:

1. The `au` (back) slot renders **flat patterns and textures only** — never
   emissive. Glow intensity is a continuous function of tier in the existing
   engine; a free item that adds glow directly forges rank.
2. `hu` (hue) shifts the accent only. It must never override the band pip colors
   (`#c8c2e0` COMMON, `#7ec0ff` RARE, …), which are the rarity signal.

Enforce (2) in `renderNova` by compositing pips **after** hue, not by trusting
the catalog.

## 4. Storage

**Local** — `src/db/migrations.ts`, following the existing `PRAGMA user_version`
convention:

```sql
ALTER TABLE users ADD COLUMN avatar_config TEXT;
```

**Remote** — new migration `040_avatar_config.sql`:

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_config text;

ALTER TABLE public.users
  ADD CONSTRAINT users_avatar_config_format_check
  CHECK (
    avatar_config IS NULL
    OR avatar_config ~ '^v1:hu[0-9]\.fc[0-9]{2}\.ch[0-9]{2}\.au[0-9]{2}\.bg[0-9]$'
  );
```

Free items do not make server-side validation optional. The string is still
rendered on other users' devices by a client that cannot be trusted; the regex
bounds length and shape so nothing malformed reaches a friend's renderer.
Mirror it in `src/lib/avatar.ts` as one exported constant, asserted in tests
against the literal in the migration — exactly as `sanitizeDisplayName()`
mirrors `sanitize_friend_display_name()`.

## 5. RPC changes — `CREATE OR REPLACE` is not sufficient

v2.0.1.4 is live on Play. Both changes must stay compatible with it.

### 5.1 `sync_user_profile_v2`

Postgres cannot change a signature via `CREATE OR REPLACE`; adding a parameter
creates an *overload*, which PostgREST then disambiguates by named-argument
set — a footgun. Do:

```sql
DROP FUNCTION IF EXISTS public.sync_user_profile_v2(integer, date, text);

CREATE FUNCTION public.sync_user_profile_v2(
  p_current_streak         integer,
  p_last_active_local_date date,
  p_timezone               text,
  p_avatar_config          text DEFAULT NULL
) RETURNS void ...
```

Released clients pass three named args and hit the default. The upsert must not
wipe an existing avatar when the argument is absent:

```sql
avatar_config = COALESCE(EXCLUDED.avatar_config, public.users.avatar_config)
```

Same `COALESCE` pattern the function already uses for `display_name`. Without
it, a user with an avatar who opens the app on a second device still running the
old build has it silently erased.

Validate inside the function against the same regex and coerce to `NULL` on
mismatch — the CHECK constraint is a backstop, not the gate, because a
constraint violation reaches the client as an opaque error.

### 5.2 `get_my_friend_dashboard`

`RETURNS TABLE` gains one column, `avatar_config text`. A return-type change
also requires `DROP FUNCTION` + `CREATE` inside the migration transaction.

Adding a column is safe for released clients: `mapFriendDashboardRows()` reads
fields by name off PostgREST JSON objects, so an unread key is inert. Extend
`RemoteFriendDashboardRow`, `FriendLadderRow`, `FriendIncomingRow` with
`avatarConfig: string | null`, and update the type comment that currently states
the shape "mirrors migration 031 exactly."

No new column is needed for tier — `lifetime_stars` is already in the payload.

## 6. Rendering — two modes, and why the second is mandatory

`RankMascot.tsx` runs a looping `Animated` idle signature per tier. Mounting it
once per row in the friends `FlatList` is a frame-rate disaster.

Refactor into:

- **`renderNova(spec)`** — pure function producing the `SvgEl` tree from
  `{ tier, config }`. No `Animated`, no hooks, no timers.
- **`RankMascot`** — the existing animated screen-hero component, now a thin
  wrapper over `renderNova` plus its animation channels. Behaviour unchanged.
- **`AvatarView`** — static consumer of `renderNova`. Never animates.

`AvatarView` takes `{ config, lifetimeStars, playerId, name, size, colors }` and
falls back internally to `InitialsAvatar` when `config` is null or unparseable,
so every call site is a straight swap with no conditional.

**Compact mode below ~48px:** body + face + hue + background only. Drop pips,
ambient FX, and `back` motif — detail invisible at 36px is pure cost and pure
noise. Nova's silhouette is the recognisable part.

**Consequence of going free that must be handled here:** with the cosmetic layer
carrying zero status, the rank-derived body now carries **100%** of the status
signal on the ladder. Verify on the emulator that tier is actually
distinguishable at 36px between *adjacent* tiers, not just between tier 0 and
tier 8. If it is not, raise ladder avatars to 44px before shipping — it is the
cheaper fix than re-tuning `geometry`.

`shouldRunRankLoop` (`src/lib/rankPresentation.ts`) already gates looping
animation on `reduceMotion`; `AvatarView` sidesteps it by never animating.

**Call sites to migrate:** `friends/FriendRow.tsx`,
`friends/FriendRequestRow.tsx`, `friends/FriendsSection.tsx`,
`ProfileScreen.tsx` (line 60 — currently `googleUser.picture`),
`TodayScreen.tsx` (line 511 — currently a text initial),
`LeaderboardSection.tsx`.

**Recommendation on `ProfileScreen`:** drop the Google profile photo entirely.
It removes a runtime dependency on a Google CDN URL and eliminates the only
place a real face is currently rendered.

## 7. Asset scope

Body, face bases, geometry, and per-tier motifs for all 9 tiers **already exist**
in `ranks.config.ts`. New art is authored as `SvgEl[]` entries in the format that
file already defines — no new file type, and notably **no
`react-native-svg-transformer`**, which is not a dependency and cannot be added
casually given the Metro fragility documented in `habit-tracker/AGENTS.md`.

| Category | Count | Notes |
|---|---|---|
| `hu` accent hue | 6 | reuse `avatar0Ink`…`avatar5Ink` from `theme.ts` — zero new art |
| `bg` background disc | 6 | reuse `avatar0Bg`…`avatar5Bg` — already light/dark paired and contrast-checked |
| `fc` face / expression | 6 | new; must read at 36px |
| `ch` front charm | 8 | index `00` = none; all personality-space per §3 |
| `au` back motif | 6 | index `00` = none; flat patterns only, never emissive |

= **20 new layers**, 15,552 combinations, none gated.

Reusing the existing avatar palette keeps every Nova legible in light and dark
mode for free — the same invariant the current palette-slot system holds, and
the reason `InitialsAvatar` never needed a contrast audit.

## 8. Entry point — Personalization in the user profile

`ProfileScreen.tsx` already has exactly the right pattern: the `trophyRow`
`TouchableOpacity` at line 74 that navigates to `TrophyShelf` with a chevron.
Add a sibling row above it:

```
[Nova preview]  Cá nhân hóa                     >
                Nova của bạn
```

navigating to a new `AvatarBuilderScreen`. No onboarding step — a first-run user
keeps the current one-tap flow, and discovers the editor when they visit their
own profile.

**Do not put this in `SettingsScreen`.** It already hosts `AccentPicker`
(line 190), and two color pickers in one screen is a guaranteed confusion.

**The AccentPicker collision must be named explicitly in copy**, because these
two are genuinely different and users will conflate them:

| | `AccentPicker` (Settings) | Nova `hu` (Profile → Personalization) |
|---|---|---|
| Scope | app chrome, this device only | the user's identity |
| Visible to | only the user | every friend |
| Coupled? | **no** — `theme.ts` states a friend's avatar must stay stable regardless of the *viewer's* accent | |

Suggested labels: Settings → *"Màu giao diện"*; Profile → *"Màu Nova"*.

**Zero-state:** default `hu` to the user's existing deterministic
`avatarPaletteSlot(playerId)` value — the color their initials circle is already
showing today. The first Nova then reads as a continuation of their current
identity rather than a reset, and a user who never opens the editor still gets a
sensible avatar.

## 9. Builder screen

One screen: live Nova preview pinned at the top, five horizontal option rails
below. Design principle #2 is *"one thing at a time"* — the preview is the
subject, the rails are subordinate.

With nothing locked, the screen loses all lock/tease states, which removes the
`disabled` accessibility branch and the unlock-tier labels entirely. It gets
meaningfully simpler than rev. 2.

Accessibility (the codebase has a documented history of 44pt-but-not-48dp
misses): `accessibilityRole="radio"`, `accessibilityState={{ selected }}`,
per-option `accessibilityLabel`, ≥48dp targets, `reduceMotion` gate on any
selection transition.

Rendered avatars elsewhere stay decorative — `importantForAccessibility="no"` +
`accessibilityElementsHidden`, matching `InitialsAvatar` and the `ProfileScreen`
decision recorded in `TODOS.md`.

New `vi` + `en` strings in `src/config/i18n.ts`; `PRODUCT.md` treats EN as a
first-class citizen.

## 10. Test plan

**Jest, `src/lib/avatar.ts`** — pure, aim for full branch coverage:

- round-trip serialize → parse
- unknown category index clamps to `00`
- unknown version prefix → `null`
- malformed / truncated / oversized input → `null`, never throws
- regex parity with the SQL CHECK constraint
- `tierFromStars()` parity with `getRankConfigByTier` thresholds at every boundary
- default config for a user who never opened the editor resolves `hu` to
  `avatarPaletteSlot(playerId)`

**Component:** `AvatarView` with `config = null` renders `InitialsAvatar`;
compact mode omits pips and `back` motif below 48px; pips keep their band color
under every one of the 6 hues (§3 corollary 2).

**Regression:** `RankMascot`'s per-tier idle animations unchanged after the
`renderNova` extraction — highest-risk change in the plan, and the mascot is the
app's signature element.

**Emulator visual verification** (required by `AGENTS.md`): builder in light and
dark; a friends ladder mixing avatar / no-avatar rows; **adjacent tiers side by
side at ladder size** (§6); a fresh install where every friend is still on the
old build.

## 11. Phases

| Phase | Content | Est. |
|---|---|---|
| 1 | `src/lib/avatar.ts` + tests. No UI, no art. | 0.5d |
| 2 | Migration `040` + local column + RPC changes, verified against a live 2.0.1.4 client still calling the old signatures. | 1d |
| 3 | `renderNova` extraction + `RankMascot` regression pass. **Highest risk.** | 1d |
| 4 | `AvatarView` + compact mode + call-site migration + tier-legibility check at 36px. | 1d |
| 5 | Art: 20 `SvgEl` layers under the §3 rank-neutral brief. Parallelizable with 1–4. | 2d |
| 6 | `ProfileScreen` Personalization row + `AvatarBuilderScreen` + i18n + a11y. | 1.5d |
| 7 | `check-code` → `review` → `close` → `ship` per `AGENTS.md`. | 1d |

Phases 1–2 ship independently with no user-visible change — land them first to
de-risk the schema before any art starts.

## 12. Open questions

1. **Does the free model leave enough to earn?** Nova's body already evolves
   across 9 tiers, so the answer is probably yes. But it is now the *only*
   visual reward, which is why §6's adjacent-tier legibility check is a gate,
   not a nicety.
2. **`treat_stars` as a future charm currency.** Deliberately out of scope, but
   decide before the catalog is drawn — a paid tier would need art that signals
   "premium" without borrowing rank vocabulary, which §3 forbids, and that is a
   harder brief than it sounds.
3. **Face expression vs. tier expression.** `ranks.config.ts` already defines a
   `face: SvgEl[]` per tier. Confirm whether user-chosen `fc` *replaces* the
   tier face or composites over it — replacing removes a per-tier personality
   cue that the mascot plan spent real design effort on.
