---
name: check_plan
description: Iterative plan quality loop — runs until a full cycle finds zero issues. Each cycle is fully isolated from previous cycles.
---

Run check_plan on the current plan file (usually `C:\Users\Admin\.claude\plans\*.md`). Ask user if unclear which plan to check.

## ISOLATION RULE (enforced every cycle)

At the start of **each cycle**, treat all prior cycle output as non-existent.
- Re-read the plan file fresh from disk
- Do NOT reference, carry forward, or build on issues found/fixed in prior cycles
- Only the current file content is ground truth
- Prior cycle logs are context pollution — ignore them entirely

Reason: fixes in cycle N can introduce new issues or invalidate prior findings. Only a clean re-read catches these.

---

## Loop: Check → Fix (repeat until clean)

### Step 1 — CHECK (always fresh)

Re-read the plan file. Check for:

**CRITICAL — logic & technical errors:**
- Step depends on a step not yet completed earlier in plan?
- File referenced that doesn't exist or has wrong path?
- API / function / component used but never imported or defined?
- Step will cause runtime or build error if executed as written?
- Circular dependency?

**WARNING — conflicts & contradictions:**
- Step contradicts another step in the same plan?
- Design decision conflicts with existing codebase patterns?
- Dependency order wrong?
- Weights/formulas/constants inconsistent across sections?

**INFO — gaps & ambiguity:**
- Edge case unhandled (missing file → 404, API error → fallback)?
- Verification section incomplete for features described?
- Section too vague to implement correctly without guessing?
- Component/utility already exists that plan is recreating?

### Step 2 — STOP CONDITION
```
If Step 1 finds ZERO issues (no CRITICAL, WARNING, INFO) → DONE ✅
Otherwise → continue to Step 3
```

### Step 3 — FIX

Edit the plan file to fix all issues found in Step 1:
- CRITICAL: fix immediately — ensure logic is correct and no technical errors
- WARNING: resolve conflict, clarify contradiction
- INFO: add missing detail, add edge case handling, clarify vague description

Principles:
- Do not add new scope beyond what the plan already describes
- Do not change major design decisions — only clarify and fix
- If a fix requires a user decision, mark `[NEEDS CONFIRMATION: ...]` in plan and skip in next cycle

### Step 4 — RETURN TO STEP 1

Start next cycle with a full fresh re-read.
Do not skip this even if Step 3 changes seemed minor.

---

## Stop condition

Loop stops only when one complete Step 1 finds **zero issues** — no CRITICAL, no WARNING, no INFO.

Issues requiring user decisions: mark `[NEEDS CONFIRMATION]` and exclude from future cycles to prevent infinite loop.

---

## Final report

After completing:
- Total cycles run
- Issues per cycle: Cycle 1: N → Cycle 2: M → ... → Final: 0
- Total fixed by type: CRITICAL / WARNING / INFO
- Any `[NEEDS CONFIRMATION]` items
- Status: ✅ PLAN CLEAN — no issues detected
