---
name: close
description: Update CLAUDE.md with session completion status, key decisions, and next steps. Final step before ending a session.
---

Before ending the session, update CLAUDE.md with:

1. **Completed work** — what was implemented or fixed this session (specific, not vague)
2. **Section status** — mark each feature/milestone as: COMPLETE / IN_PROGRESS / BLOCKED
3. **Next steps** — concrete, specific tasks for the next session
4. **Key decisions** — architectural decisions made this session and the rationale

## Error Logging Rule

If errors were encountered this session, append to CLAUDE.md under `## Known Errors & Fixes`:

```markdown
## Known Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `<exact error message>` | <root cause> | <solution> |
```

**Constraint:** CLAUDE.md must stay under 500 lines. Before appending, check line count:
```bash
wc -l CLAUDE.md
```
If at limit: remove oldest resolved entries first, then append.

## Final Step

After CLAUDE.md is updated: run `/compact` to compress conversation context.
