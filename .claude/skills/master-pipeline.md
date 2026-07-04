---
name: master-pipeline
description: Master Skill Pipeline for habit-tracker — Audit (impeccable audit all → fix) → QA (qa → fix) → Release Notes (user-facing changelog → wait for confirmation) → Deploy (build-then-ship). Each phase boundary compacts context natively before continuing.
---

Run the full release pipeline for the habit-tracker app: Audit → QA → Release Notes → Deploy. Each phase writes its findings to `habit-tracker/.audit/` so results survive context compaction between phases — don't carry raw findings forward in conversation, reference the written file instead.

## Phase 1 — AUDIT

1. Run skill `impeccable` with args `audit all`.
2. Compact context (native — see note below).
3. Fix every P0/P1 finding from the audit report; use judgment on P2/P3 (quick wins now, larger refactors go to the backlog section of the report instead of blocking the pipeline).
4. Write the audit report + fix summary to `habit-tracker/.audit/impeccable-audit-<date>.md`.
5. Verify: `npx tsc --noEmit` and `npx jest --runInBand` must both be clean before proceeding.

Do not proceed to Phase 2 until P0/P1 fixes are verified clean.

---

## Phase 2 — QA

1. Run skill `qa`.
   - **Fallback**: the generic `/qa` skill (gstack) targets web apps — it needs a URL and a headless browser, and will stall or misfire on a React Native/Expo project with no web target. If it doesn't fit, substitute this project's actual QA gate instead: `npx tsc --noEmit` + `npx jest --runInBand`, plus live verification on the Android emulator (skills `emulator` / `metro-fix` as needed) per `AGENTS.md`. Note which path was taken in the QA report.
2. Compact context (native — see note below).
3. Fix every bug found; re-verify (tsc/jest, and re-screenshot any UI touched) after each fix.
4. Write the QA report to `habit-tracker/.audit/qa-report-<date>.md`.

Do not proceed to Phase 3 until QA is clean with no open regressions.

---

## Phase 3 — RELEASE NOTES

1. Compact context (native — see note below).
2. Generate a user-facing "What's New" entry — non-dev language, benefit-framed, suitable for the in-app News feed (Supabase `news` table, see `habit-tracker/supabase/migrations/008_create_news_table.sql`). Draft both EN and VI copy plus `version`/`tag` field values.
3. Write the draft to `habit-tracker/.audit/news-entry-<date>.md`. Do **not** insert it into Supabase — publishing user-facing content is a confirm-first action, and this session likely has no DB write access anyway.
4. Update `CHANGELOG.md` (technical, matches existing Keep-a-Changelog format) and `TODOS.md` (dated Completed entry) if behavior or decisions changed this pass.
5. **STOP.** Present the audit/QA/release-notes summary and the News draft to the user. Wait for explicit confirmation before Phase 4. Do not proceed on an assumed yes.

---

## Phase 4 — DEPLOY

Only after the user confirms:

1. Compact context (native — see note below).
2. Run skill `build-then-ship`. This loops `gradlew bundleRelease` to a clean build, then invokes the full `ship` pipeline (tests, review diff, bump VERSION, update CHANGELOG, commit, push, create PR) per that skill's own stop conditions.

---

## Skill Reference (exact names for Skill tool)

| Phase uses | Skill tool name | Source |
|---|---|---|
| Audit | `impeccable` (args: `audit all`) | project-local (`.claude/skills/impeccable`) |
| QA | `qa` (fallback: project tsc/jest/emulator gate) | gstack, with project fallback |
| Deploy | `build-then-ship` | project-local (`.claude/skills/build-then-ship.md`) |

**Note on /compact:** compact is handled by Claude natively — do not invoke it as a skill or tool call. Its purpose in this pipeline (keep context lean between heavy phases) is satisfied by writing each phase's findings to `habit-tracker/.audit/*.md` and referencing the file rather than re-stating raw findings in conversation.

---

## Final Report

After the pipeline reaches Phase 3's stop point (or completes Phase 4 if confirmed):

- Phase 1: Audit health score, P0/P1 count found/fixed, report path
- Phase 2: QA method used (`qa` skill or project fallback), bugs found/fixed, report path
- Phase 3: News draft path, CHANGELOG/TODOS updated (yes/no)
- Phase 4 (if run): build result, ship pipeline outcome, PR link
- Any `[BLOCKED]` or `[NEEDS CONFIRMATION]` items requiring user action
