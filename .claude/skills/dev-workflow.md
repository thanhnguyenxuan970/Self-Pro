---
name: dev-workflow
description: Use when implementing, fixing, or improving PokeScan code and need a full pipeline — parallel backend+android fix, then sequential test→review→PR. Trigger with /dev-workflow.
---

# PokeScan Dev Workflow

5-agent pipeline: parallel fix → sequential quality gates → PR prep.

## Execution Order

```
Step 1 (PARALLEL — dispatch simultaneously):
  ├── backend-agent   → fixes backend Python code
  └── android-agent   → fixes Android Kotlin code

Step 2 (SEQUENTIAL — wait for Step 1 to finish):
  test-runner         ← receives: backend-agent output + android-agent output
      ↓
  code-reviewer       ← receives: test-runner results + changed file list
      ↓
  pr-preparer         ← receives: review verdict + test summary + change list
```

## How to Run

### Step 1 — Dispatch Backend + Android in Parallel

Invoke BOTH agents in a single message (two Agent tool calls in one response):

**Backend agent prompt:**
```
You are the backend-agent for PokeScan.

Task: [DESCRIBE THE BACKEND TASK]

Changed files scope: backend/app/

Return: list of files changed + 1-line summary per change + any SECURITY/VIOLATION flags.
```

**Android agent prompt:**
```
You are the android-agent for PokeScan.

Task: [DESCRIBE THE ANDROID TASK]

Changed files scope: android/app/src/main/

Return: list of files changed + 1-line summary per change + any SECURITY/VIOLATION flags.
```

### Step 2a — Test Runner (after both Step 1 agents finish)

```
You are the test-runner for PokeScan.

Prior changes:
  Backend: [paste backend-agent output]
  Android: [paste android-agent output]

Run all tests. Report results in your standard format.
```

### Step 2b — Code Reviewer (after test-runner output)

```
You are the code-reviewer for PokeScan.

Test results: [paste test-runner output]

Changed files:
  [list from backend-agent + android-agent outputs]

Review all changed files. If tests failed, immediately output CHANGES_REQUIRED.
```

### Step 2c — PR Preparer (after code-reviewer output)

```
You are the pr-preparer for PokeScan.

Review verdict: [paste code-reviewer output]
Test summary: [paste test-runner SUMMARY line]
Changed files: [list]
Change description: [what was changed and why]

Prepare commit message and PR description.
```

## Gate Rules

| Gate | Condition to proceed |
|------|---------------------|
| Step 1 → Step 2a | Both parallel agents must finish |
| Step 2a → Step 2b | Always (test-runner reports pass or fail) |
| Step 2b → Step 2c | code-reviewer verdict must be APPROVED or APPROVED_WITH_NOTES |
| Step 2c → Merge | No BLOCKERS in pr-preparer output |

**If code-reviewer outputs `CHANGES_REQUIRED`:** re-run Step 1 with the specific fixes needed, then re-run Step 2 chain. Do NOT skip to PR prep.

## When to Use This Workflow

- Bug fixes touching both layers (backend + Android)
- Feature implementation across the stack
- Refactors that affect multiple files

**Skip to single agent** when change is isolated:
- Backend-only bug → `backend-agent` directly
- Android-only UI fix → `android-agent` directly
- Tests only → `test-runner` directly
