---
name: check_code
description: Iterative code quality loop — review → fix → optimize until a full cycle finds zero issues. Each cycle is fully isolated from previous cycles.
---

Run check_code on the codebase or specified files. Ask user if scope is unclear.

## ISOLATION RULE (enforced every cycle)

At the start of **each cycle**, treat all prior cycle output as non-existent.
- Re-read all relevant files fresh from disk
- Do NOT reference, carry forward, or build on issues found/fixed in prior cycles
- Only current file content is ground truth
- Prior cycle logs are context pollution — ignore them entirely

Reason: fixes in cycle N can introduce new issues or make prior findings stale. Only a clean re-read detects these accurately.

---

## Loop: Review → Fix → Optimize (repeat until clean)

### Step 1 — REVIEW (always fresh)

Re-read all relevant files. Check full list:

**Structure & config:**
- Imports missing or unused?
- Environment variables referenced but not declared?
- Config values hardcoded that should be env vars?

**Logic & correctness:**
- Function produces wrong output for edge inputs?
- Off-by-one, null/undefined not handled, wrong comparison operator?
- Async/await missing where needed?
- Race condition or unhandled Promise rejection?

**Security:**
- User input used without validation or sanitization?
- API keys or secrets in client-side code?
- SQL/command injection possible?
- Auth check missing on protected route?

**Data integrity:**
- DB write without transaction where atomicity required?
- Schema mismatch between model and actual table?
- Cache not invalidated after write?

**Performance:**
- N+1 query?
- Missing index on filtered/joined column?
- Blocking call in async context?

**Cross-cutting:**
- Error not surfaced to user where it should be?
- Log statement exposes sensitive data?
- Dead code that should be removed?

Classify all issues:
- CRITICAL — will cause build fail, runtime error, or data corruption
- WARNING — incorrect code, will cause bug or wrong behavior
- INFO — works but can be improved

### Step 2 — STOP CONDITION
```
If Step 1 finds ZERO issues → DONE ✅
Otherwise → continue to Step 3
```

### Step 3 — FIX

Fix all CRITICAL and WARNING issues from Step 1.
- Make minimal targeted edits — do not refactor beyond the fix
- Do not change behavior of unrelated code
- If fix requires user input or external credential, mark `[NEEDS CONFIRMATION: ...]` and skip

### Step 4 — OPTIMIZE

Address INFO issues from Step 1:
- Remove dead code
- Simplify overly complex logic
- Add missing edge case handling
- Only optimize what Step 1 identified — no scope creep

### Step 5 — RETURN TO STEP 1

Start next cycle with full fresh re-read of all files.
Do not skip even if changes in Steps 3–4 seemed minor.

---

## Stop condition

Loop stops only when one complete Step 1 finds **zero issues** — no CRITICAL, no WARNING, no INFO.

Issues requiring user decisions or external input: mark `[NEEDS CONFIRMATION]` and exclude from future cycles.

---

## Final report

After completing:
- Total cycles run
- Issues per cycle: Cycle 1: N → Cycle 2: M → ... → Final: 0
- Total fixed by type: CRITICAL / WARNING / INFO
- Any `[NEEDS CONFIRMATION]` items
- Status: ✅ CODE CLEAN — no issues detected
