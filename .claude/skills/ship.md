---
name: ship
description: Final delivery: update CLAUDE.md (close), then auto-commit all session changes. Use instead of running close + caveman-commit separately.
---

Finalize and ship the current session's work.

## Phase 1 — CLOSE

Run skill `close`:
- Update CLAUDE.md with completed work, section status, next steps, key decisions.
- Append any new errors to Known Errors & Fixes table.
- Do not proceed until CLAUDE.md is updated and under 500 lines.

---

## Phase 2 — CAVEMAN-COMMIT

Run skill `caveman:caveman-commit` to generate the commit message.

- Scope: all changes made this session (including CLAUDE.md update from Phase 1).
- Skill produces a conventional-commits subject + optional body.
- Do not proceed until message is ready.

---

## Phase 3 — AUTO COMMIT

Execute the commit without asking for confirmation:

```bash
git add -A
git commit -m "<subject from Phase 2>"
```

- No user prompt. Ship means ship.
- After commit succeeds, report hash and subject line.

---

## Final Report

- CLAUDE.md updated: ✅ / ❌
- Commit created: ✅ `<hash> <subject>` / ❌ reason
- Status: ✅ SHIPPED
