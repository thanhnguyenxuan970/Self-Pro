---
name: process
description: Run the full Self-Pro delivery pipeline from plan validation through implementation, verification, review, documentation, and commit preparation. Use for implementation tasks governed by the repository process.
---

Execute the full delivery pipeline for the current plan. Ask user which plan file if unclear.

## Phase 1 — VALIDATE PLAN

1. Run skill `check-plan` on the plan file or active Codex plan.
   - Do not proceed until check-plan reports ✅ PLAN CLEAN.
   - If `[NEEDS CONFIRMATION]` items remain, surface them to user and wait for resolution.

---

## Phase 2 — IMPLEMENT

Implement every step in the (now-clean) plan file, in order.

Rules:
- Follow the plan exactly — no scope additions, no design changes.
- After each step, verify the step's output matches what the plan describes before moving to the next.
- If a step is blocked (missing credential, external dependency), mark `[BLOCKED: reason]` inline in the plan and skip — continue remaining steps.
- Do not ask for confirmation between steps unless a step is marked `[NEEDS CONFIRMATION]`.

When all steps are done (or blocked with reason), state:
- Steps completed: N
- Steps blocked: M (with reasons)

---

## Phase 3 — VERIFY CODE

1. Run skill `check-code` on all files created or modified during Phase 2.
   - Scope: only files touched in Phase 2 (not the entire codebase).
   - Do not proceed until check-code reports ✅ CODE CLEAN.

---

## Phase 4 — REVIEW & FIX

1. Run skill `review` on all files created or modified during Phase 2, using the Codex code-reviewer agent instructions for the final pass.
   - Fix every issue surfaced before proceeding.
   - Do not proceed to Phase 5 until review is clean.

---

## Phase 5 — CLOSE

1. Run skill `close` to finalize the delivery.
   - Do not run close until Phase 4 review is clean.

---

## Phase 6 — COMMIT

Use the `pr-preparer` agent instructions to generate a Conventional Commit message, then create the commit.

- Scope: all changes from Phases 2–5.
- Do not commit until close completes successfully.

---

## Skill Reference (exact names for Skill tool)

| Phase uses | Skill tool name | File |
|---|---|---|
| check-plan | `check-plan` | `.agents/skills/check-plan/SKILL.md` |
| check-code | `check-code` | `.agents/skills/check-code/SKILL.md` |
| review | `review` | `review.md` (project-local) |
| close | `close` | `close.md` (project-local) |

**Note:** Context compaction is handled by Codex automatically; do not invoke it as a skill.

---

## Final Report

After all six phases complete:

- Phase 1: cycles run + issues fixed
- Phase 2: steps completed / blocked
- Phase 3: cycles run + issues fixed
- Phase 4: review issues found + fixed
- Phase 5: close actions taken
- Phase 6: commit created
- Any `[NEEDS CONFIRMATION]` or `[BLOCKED]` items requiring user action
- Status: ✅ PROCESS COMPLETE — plan clean, implemented, code clean, reviewed, closed, committed
