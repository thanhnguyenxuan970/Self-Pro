---
name: milestone-audit
description: Post-milestone system audit — probe adversarially, run all tests, review code, fix issues, close session, commit, compact. Invoke when a development milestone completes.
---

Full-system audit after a development milestone. Ensures the codebase is clean, tests pass, no failure modes are unguarded, and CLAUDE.md is up to date before closing out.

## When to Invoke

- End of a numbered development "Day" or sprint
- End of a feature branch before PR
- After any substantial refactor
- Before merging to main

## Execution Flow

### Phase 1 — Adversarial Probe

Invoke `stress-test-agent`:
- Input: list of files changed this milestone (`git diff --name-only HEAD~N` where N = commit count)
- Collect findings. Do not gate on findings — proceed to Phase 2 regardless of result.

### Phase 2 — Test Suite

Invoke `test-runner` on the full suite:
- **INFRA_ERROR → STOP.** Report blocker to user. Do not proceed past infrastructure failures — audit is invalid without a passing test baseline.
- Test failures → collect, proceed to Phase 3 then Phase 4.
- All pass → proceed to Phase 3.

### Phase 3 — Code Review

Invoke `code-reviewer`:
- Input: changed files + Phase 2 test summary
- Collect verdict. Proceed to Phase 4 regardless.

### Phase 4 — Fix Pass (conditional)

**Trigger if any of:**
- Phase 1 has CRITICAL or HIGH findings
- Phase 2 has test failures (not INFRA_ERROR)
- Phase 3 verdict is CHANGES_REQUIRED

**Action:**
1. Consolidate all issues from Phases 1–3 into a single list grouped by layer (db / logic / ui / api / config)
2. Fix each issue directly using appropriate tooling (Edit/Write tools)
3. Re-run test-runner after all fixes — must pass before continuing
4. If new failures appear: repeat fix → test until clean

**Skip Phase 4 if:** Phase 1 has no CRITICAL/HIGH + Phase 2 is PASS + Phase 3 is APPROVED or APPROVED_WITH_NOTES.

### Phase 5 — Close

Invoke `close` skill:
- Update CLAUDE.md: mark milestone complete, record key decisions made, update "Next Steps"
- Log any errors encountered under `## Known Errors & Fixes`

### Phase 6 — Commit

After CLAUDE.md update is complete:
```bash
git add -A
git commit -m "chore(milestone): post-[milestone-name] audit

stress-test: X CRITICAL, Y HIGH | tests: N/N pass | review: APPROVED

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
Replace `[milestone-name]` with the specific milestone identifier (e.g., `day-7`, `feat-auth`).
Replace finding counts and test count with actuals.

### Phase 7 — Compact

Run `/compact` to compress conversation context.

**This must be the last action. Do not add steps after /compact.**

## Invariants

- Phases run in order: 1 → 2 → 3 → 4 (conditional) → 5 → 6 → 7. No reordering.
- Phase 2 INFRA_ERROR is a hard stop. No audit is valid without a passing test baseline.
- Phase 4 always re-runs test-runner after fixes. Never skip the recheck.
- /compact is always last, always runs — even if earlier phases found nothing.
