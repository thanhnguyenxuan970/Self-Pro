---
name: review-board
description: Launch 4 parallel specialist review agents (accessibility, performance, visual-design, edge-case) against the current diff, then synthesize their findings into one prioritized fix list ranked by severity. Read-only. Use before committing/shipping, or whenever a multi-lens code review is requested.
---

# review-board

Multi-agent review pass over the current diff. Read-only — reports findings, never fixes.

## Phase 1 — SCOPE

1. `git diff HEAD` — if empty, `git diff HEAD~1 HEAD` (reviewing the last commit instead).
2. If still empty: report "no changes to review", stop.
3. List touched files. This is the scope every agent below must stay inside.

## Phase 2 — DISPATCH (parallel, single message, 4 Agent calls, subagent_type: code-reviewer)

Launch all 4 in **one message** (background, default) so they run concurrently — do not launch sequentially. Each gets: the diff/file list from Phase 1, its persona, its checklist, and the required output format. Read-only — instruct each explicitly not to edit anything.

**Agent 1 — Accessibility auditor**
Checks: `reduceMotion` gates on every `Animated` loop, audio/haptic toggles, `accessibilityRole`/`accessibilityLabel` on interactive elements, text contrast vs WCAG AA (4.5:1 body, 3:1 large text — compare actual token hex pairs), touch targets ≥44pt, focus/reading order.

**Agent 2 — Performance profiler**
Checks: unnecessary re-renders (inline objects/functions passed as props, missing `useMemo`/`useCallback` on values used in deps), entrance/stagger effects that fire on every re-render instead of mount-once, animations not using `useNativeDriver: true` where they could, N+1 query patterns, unbounded lists without windowing/virtualization.

**Agent 3 — Visual-design critic**
Checks: hardcoded hex colors instead of theme tokens, hardcoded `fontWeight` instead of `FontFamily` tokens, asset misuse (wrong aspect ratio, rotation, low-res), spacing/alignment drift from surrounding established patterns, unhandled empty/zero states.

**Agent 4 — Edge-case hunter**
Checks: all-zero / null / empty data paths, stale closures / stale cache reads, dead code (a component wired to open a JSX element that doesn't match the file it's imported from), race conditions on concurrent writes, off-by-one errors on date/week boundaries.

Every agent must reply using this exact per-finding format (or the literal string "no findings"):

```
[P0|P1|P2] file:line — one-line defect — concrete failure scenario
```

Severity guide: P0 = crashes/data-loss/security, P1 = visible bug or a11y/perf regression, P2 = polish/nit.

## Phase 3 — SYNTHESIZE

After all 4 agents report back:

1. Collect every finding into one list.
2. De-duplicate: if 2+ agents flag the same file:line, keep one entry, note it was caught from multiple lenses in the summary.
3. Sort P0 → P1 → P2, then by file path.
4. Call `ReportFindings` with the merged, deduplicated, severity-sorted list. Do not pad — an agent with no findings contributes zero entries.

## Final Report

- Agents run: 4/4 (name any that failed or returned malformed output)
- Findings: N total (P0: x, P1: y, P2: z)
- Status: ✅ REVIEW BOARD COMPLETE
