---
name: close
description: Update AGENTS.md or project documentation with completion status, durable decisions, and next steps. Use to close a development session.
---

Before ending the session, update AGENTS.md or the appropriate project documentation with:

1. **Completed work** — what was implemented or fixed this session (specific, not vague)
2. **Section status** — mark each feature/milestone as: COMPLETE / IN_PROGRESS / BLOCKED
3. **Next steps** — concrete, specific tasks for the next session
4. **Key decisions** — architectural decisions made this session and the rationale

## Error Logging Rule

If errors were encountered this session, append durable troubleshooting guidance under `## Known Errors & Fixes`:

```markdown
## Known Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `<exact error message>` | <root cause> | <solution> |
```

**Constraint:** Keep AGENTS.md concise. Prefer CHANGELOG.md or dedicated docs for long history:
```bash
wc -l AGENTS.md
```
If at limit: remove oldest resolved entries first, then append.

## Final Step

After documentation is updated, summarize verification and remaining work.
