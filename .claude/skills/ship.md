---
name: ship
description: Final delivery: update CLAUDE.md (close), run the review board, then auto-commit all session changes. Use instead of running close + caveman-commit separately.
---

Finalize and ship the current session's work.

## Phase 1 — CLOSE

Run skill `close`:
- Update CLAUDE.md with completed work, section status, next steps, key decisions.
- Append any new errors to Known Errors & Fixes table.
- Do not proceed until CLAUDE.md is updated and under 500 lines.

---

## Phase 2 — REVIEW BOARD (mandatory)

Run skill `review-board` on the diff being shipped.

- If any P0 findings remain, fix them and re-run `review-board` on the affected files before proceeding.
- P1/P2 findings: fix if trivial; otherwise note them in the Phase 3 commit body — do not block shipping on them.
- Do not proceed to Phase 3 until 0 P0 findings remain.

---

## Phase 3 — CAVEMAN-COMMIT

Run skill `caveman:caveman-commit` to generate the commit message.

- Scope: all changes made this session (including CLAUDE.md update from Phase 1, and any P0 fixes from Phase 2).
- Skill produces a conventional-commits subject + optional body.
- Do not proceed until message is ready.

---

## Phase 4 — AUTO COMMIT

Execute the commit without asking for confirmation:

```bash
git add -A
git commit -m "<subject from Phase 3>"
```

- No user prompt. Ship means ship.
- After commit succeeds, report hash and subject line.

---

## Final Report

- CLAUDE.md updated: ✅ / ❌
- Review board: N findings (P0: x fixed, P1: y, P2: z)
- Commit created: ✅ `<hash> <subject>` / ❌ reason
- Status: ✅ SHIPPED
