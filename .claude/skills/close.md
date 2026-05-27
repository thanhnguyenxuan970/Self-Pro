---
name: close
description: Cập nhật CLAUDE.md với những gì đã hoàn thành, trạng thái từng phần, bước tiếp theo, và quyết định quan trọng
---

Trước khi kết thúc hãy cập nhật CLAUDE.md với những gì hoàn thành ở trong session này. Trạng thái cập nhật của từng phần, bước tiếp theo cần làm trong session sau. Những quyết định quan trọng đã đưa ra và lý do tại sao.

## Error Logging Rule

If any errors were encountered during this session, append them to CLAUDE.md under a `## Known Errors & Fixes` section:

```markdown
## Known Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `<exact error message>` | <root cause> | <solution> |
```

**Constraint:** Keep CLAUDE.md total length under 500 lines. Before appending, check `wc -l CLAUDE.md`. If adding errors would exceed 500 lines, remove the oldest/resolved entries first.
