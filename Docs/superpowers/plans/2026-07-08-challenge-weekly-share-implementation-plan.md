# Challenge Flow — Weekly Mode, States & Share Cards

Implementation plan for the screens added to `Challenge Flow.dc.html`.
Covers the spec's new **weekly** mode, challenge **done/failed** states, and the
**share cards**. All copy is Vietnamese; brand mark is the 🌱 sprout, wordmark **Habi**.

Design system: Habi (`_ds/habi-design-system-...`). Dark theme, green accent.
Reuse tokens — never hardcode colors/spacing.

---

## A4 · Create Challenge — Weekly mode

**Purpose:** Create flow when the user picks the new `weekly` mode (Đủ số buổi/tuần).

**Sections (top → bottom):**
1. **Tên thử thách** — text input, ≤ 40 chars, live counter.
2. **Chọn kiểu** — 2-card mode picker: `Mỗi ngày (chuỗi)` vs `Đủ buổi / tuần` (selected). Selected card = `--primary-soft` bg, `--primary` border, ✓ badge top-right.
3. **Số buổi mỗi tuần** — chips `3 / 4 / 5 / 6` (`weekly_target`).
4. **Số tuần** — chips `2 / 4 / 8 / 12` (`total_weeks`).
5. **Luật chơi** — read-only rules card: "Đủ 4 buổi mỗi tuần, ngày nào tập cũng được. Nghỉ tự do — không tính là lỡ. Tuần tính từ Thứ 2."
6. **CTA** — primary button "Bắt đầu · N tuần".

**Data written:** `mode='weekly'`, `weekly_target`, `total_weeks`, `start_date`, `status='active'`.

**Notes:** Streak variant already exists as A2. Mode picker is the branch point between the two.

---

## A5 · Challenge Detail — Weekly mode

**Purpose:** Progress view for a running `weekly` challenge.

**Sections:**
- **Header** — back · title · status pill "● Tuần k/total".
- **Hero ring** — center reads `buổi X / weekly_target` for the current week; sub-label "Tuần k / total". Ring fill = week progress (not lifetime).
- **Nhịp / Pace card** — replaces the flame. Segmented pill bar (one segment per required session; filled = done). Status pill: `✓ Đúng nhịp` / `⚠️ còn N buổi trong M ngày` / `🔴 bất khả thi`. Sentence below quantifies remaining sessions vs remaining days.
- **Week strip (T2 → CN)** — 7 cells, one per weekday:
  - `✓` done (`--primary-soft`)
  - `🌴` rest / valid off-day (`--surface-2`) — **NOT** a miss, no ❌
  - `🔥` today (outline `--primary`)
  - plain number = future day
- **Stats** — `Tổng buổi đã tập` · `🔥 Tuần hoàn hảo` count.
- **Overachiever hint** — `--star-soft` banner: exceed weekly target → unlock badge "Cày vượt chỉ tiêu".
- **Footer** — reset button + primary "Chia sẻ ... ⤴".

**Rules reflected:** week starts Monday; rest days are valid; pace warns against back-loading; missing quota = week "hụt" (recorded, not blocked).

---

## A6 · Challenge Detail — Done + reward

**Purpose:** Completion celebration + reward combo (fires when `status='done'`).

**Sections:**
- **Confetti** — absolutely-positioned confetti chips (decorative, `pointer-events:none`).
- **Hero** — gold trophy Badge, eyebrow "HOÀN THÀNH THỬ THÁCH", title, "30/30 ngày · không đứt dây 🔥".
- **Phần thưởng combo** — single card, hairline-divided rows:
  - `★ +120` Sao thưởng (scale theo độ dài / tổng buổi)
  - `▲ +80` Điểm rank
  - `🏅` Huy hiệu mới — vào Hồ sơ công khai
  - `🔓` Mở khoá thử thách cấp cao
- **Hành trình · Trước → Sau** — before/after photo pair with center → (only if photos exist).
- **CTA** — primary "Chia sẻ hành trình ⤴".

**Reward matrix (spec §9):** bonus sao/rank + public-profile badge + unlock higher tier + optional before-after reveal + shareable card. Applies to both modes.

---

## A7 · Challenge Detail — Failed (kind)

**Purpose:** Streak broke after freeze spent (`status='failed'`). Tone: neutral, forward-looking.

**Sections:**
- **Header** — status pill "● Đã kết thúc" (muted, not danger-red).
- **Hero** — muted 🌱 in a circle, "Chuỗi đã gián đoạn", encouraging body: acknowledges the miss, redirects forward ("… quãng đường đó vẫn có giá trị. Bắt đầu lại hôm nay nhé.").
- **Đã làm được** — stats of what was earned (ngày liên tục, sao đã nhận) — never zero out the effort.
- **Freeze note** — `--surface-2` banner explaining the phao cứu was used, reset is OK.
- **CTA** — share (still enabled) + primary "Làm lại thử thách".

**Principle:** failure copy is kind and honest; the retry CTA is primary.

---

## C1 · Share Card — stats (no photo)

**Purpose:** Shareable card that works **without** a photo (spec: share always on).

**Format:** 328 × 583 story card, solid `--primary` bg + soft white glow wash.

**Content:**
- Brand lockup: 🌱 in translucent circle + **Habi**.
- Eyebrow "THỬ THÁCH HOÀN THÀNH" + challenge title.
- Giant numeral `30/30 🔥` (the loudest element).
- Line "Không đứt dây, trọn 30 ngày".
- Two translucent chips: `★ 120` Sao thưởng · rank chip.
- Footer tagline "hoàn thành mỗi ngày, cứ thế mà lặp".

**Variants:** streak → "N/target 🔥"; weekly → "Tuần k hoàn hảo". Mid-challenge shares (streak day 7/14/21; end of each weekly week) reuse this layout.

---

## C2 · Share Card — before → after

**Purpose:** Journey reel card generated when a completed challenge **has** both photos.

**Format:** 328 × 583, dark `#0F1410` bg.

**Content:**
- Top: split photo pair (Trước | Sau) with a `--primary` circular → badge on the seam.
- Bottom panel: 🌱 **Habi** lockup, challenge title, result chips (`★ +120`, `🔥 30/30`), tagline.

**Privacy (spec §5):** photos optional, private by default, stored local-first; cloud only on opt-in share.

---

## Cross-cutting conventions

- **Brand:** wordmark **Habi**, mark = 🌱 sprout (growth = core concept). No "habit ring" / ring-check.
- **Language:** Vietnamese throughout (nav: Trang chủ · Lịch · Thống kê · Hạng; labels Trước/Sau).
- **Calendar legend:** ✓ xong · ⚪ chưa tới · 🔥 hôm nay · 🌴 nghỉ hợp lệ (weekly) · 💔 reset (streak).
- **Colors:** `--primary` progress, `--star-gold` reward economy, `--danger-soft` only for real streak breaks. Rest days never use danger.
- **Share:** always enabled — no photo required.

## Open item

- **Rank names** ("Rizz", "Aura Farmer") — RESOLVED during review: keep English + VN
  subtitle, matching existing `ranks.config.ts` / `New Ranks.dc.html`. No new work.

---

## Review Addendum (locked decisions from /plan-ceo-review, 2026-07-08)

**Mode:** SELECTIVE EXPANSION. Approach: ideal architecture (new `challengeWeekly.ts`
pure-function module mirroring `challenge.ts`; shared `computeChallengeReward()`;
mode-branched detail-screen subcomponents; dedicated `ShareCardStats`/
`ShareCardBeforeAfter` at the plan's exact 328×583 spec).

### Accepted scope additions
- Milestone share CTA (streak day 7/14/21; weekly end-of-week) reusing the C1 card.
- Overachiever badge ("Cày vượt chỉ tiêu") registered as a real `achievements.ts`
  entry, computed from weekly log data, surfaced in Trophy Shelf.
- Necessary baseline addition: weekly-mode day-boundary/rollover hook into the
  existing midnight/foreground trigger in `App.tsx`.

### Critical gap found by outside voice (verified in code, not hypothetical)
`habit-tracker/src/db/migrations.ts:303` — `target_days INTEGER NOT NULL
CHECK(target_days IN (7,21,30,66))`. Never relaxed by any later migration.
Two consequences, both now in scope:
1. Weekly mode cannot insert rows at all under this constraint (no legal
   `target_days` value exists for a 14/28/56/84-day weekly commitment).
2. **Pre-existing production bug, independent of this plan:** `CHALLENGE_DURATIONS
   = [30, 60, 100]` (`challenges.config.ts:1`) is wired straight into
   `INSERT INTO challenges` (`useChallenge.ts:489`) — 60 and 100 are not in the
   CHECK list, so creating a 60- or 100-day streak challenge today should throw
   a raw SQLite CHECK-constraint failure.

**Decision:** rebuild the `challenges` table (standard SQLite create-copy-drop-
rename pattern, single transaction) to widen/remove the `target_days` CHECK and
add the new `mode` (nullable, NULL = 'streak' at read time) / `weekly_target` /
`total_weeks` columns, fixing both the weekly-mode blocker and the pre-existing
60/100-day bug in one migration.

### Other locked decisions
- Weekly mode uses the **same freeze-then-fail semantics as streak** (1 missed
  week consumes the freeze, a 2nd miss fails the challenge) — status machine
  reaches `'failed'` for weekly mode too; A7 needs a mode-aware copy variant.
- `PHAO_COUNT=1` stays flat (not scaled by `total_weeks`).
- New curated `WEEKLY_CHALLENGE_REWARDS` table for all 16 `weekly_target ×
  total_weeks` combos (mirrors existing `CHALLENGE_REWARDS` pattern) — no
  formula-fallback payouts for weekly mode.
- Week 1 for a mid-week-created weekly challenge is a **partial calendar week**
  (creation day → following Sunday), not a challenge-relative 7-day window.
  Weeks always align to the calendar Mon-Sun grid thereafter.
- A5 pace card shows the neutral ✓ "Đúng nhịp" state on first render (0 done,
  full week remaining) rather than a premature warning.
- New `WeekStrip` component reuses `ChallengeDayGrid`'s existing
  accessibilityLabel/accessibilityState pattern (no emoji-only a11y gap).
- Share-capture failures stay silent (matches existing `ChallengeDetailScreen`
  pattern) for the new C1/C2 cards.
- No concurrent streak + weekly challenges — unchanged from today's
  one-active-challenge-per-user unique index; not a regression, not addressed
  further since it was never in scope to change.

### NOT in scope
- Proactive push notification for weekly pace warnings — TODOS.md (P2), needs
  its own notification-frequency design pass.
- Share-card consolidation (`ShareCard.tsx` vs new C1/C2) — TODOS.md (P3).
- Full rank-name localization — resolved, no work (see Open item above).
- Freeze-count scaling by `total_weeks` — kept flat at 1, not pursued.

### What already exists (reused, not rebuilt)
`challenge.ts` streak pure functions (model for `challengeWeekly.ts`) ·
`ChallengeDayGrid` a11y pattern (reused by `WeekStrip`) · `captureRef` +
`expo-sharing` share flow (reused by C1/C2) · `achievements.ts` Trophy Shelf
(overachiever badge registered here) · existing midnight/foreground rollover
trigger in `App.tsx` (extended, not replaced) · `scheduleChallengeReminder`
(referenced by the deferred push-notification TODO, not built now).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_open→resolved | 11 sections reviewed; schema CHECK-constraint blocker (critical, verified in code), freeze/reward calibration, mid-week week-1 semantics, weekly fail-state, a11y reuse — all resolved via user decision |
| Outside Voice | Claude subagent (Codex rate-limited, fell back) | Independent 2nd opinion | 1 | issues_found→resolved | 8 findings; most severe: `target_days` CHECK blocks weekly inserts + pre-existing 60/100-day production bug — both now in scope to fix via table rebuild |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | not run | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | — |

**CROSS-MODEL:** Outside voice found issues the section-by-section review had not yet reached (schema constraint, data-layer branching scope); no direct disagreement with sections already completed.

**VERDICT:** CEO review complete, all findings resolved by explicit user decision — ready to implement. Eng review not run this session (not requested); recommend running it after implementation if further architectural scrutiny is wanted before ship.

NO UNRESOLVED DECISIONS
