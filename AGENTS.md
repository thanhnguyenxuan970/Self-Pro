# Self-Pro Codex Guide

This is the Codex-facing adapter for the Self-Pro workspace. Keep durable product knowledge in shared documents and implementation-specific rules in nested `AGENTS.md` files.

## Repository Map

- `habit-tracker/`: active Habi React Native + Expo application. Read `habit-tracker/AGENTS.md` before changing it.
- `habit-tracker-components/`: supporting component experiments and references.
- `Docs/`: shared architecture, schema, and migration references used by every agent.
- `ui_kits/`: reusable visual references and UI assets.
- `PRODUCT.md`: product goals, users, and design principles.
- `TODOS.md`: open and completed work.
- `CHANGELOG.md`: shipped behavior and release history.
- `VERSION`: workspace release version.
- `.agents/skills/`: Codex project skills.
- `.codex/agents/`: Codex custom subagent roles.
- `.codex/config.toml`: project-scoped Codex configuration.
- `.claude/`: Claude-specific settings and workflows; do not treat these as Codex config.

## Shared Knowledge

Read the smallest relevant source instead of duplicating it into agent configuration:

- Product decisions: `PRODUCT.md`
- Current work: `TODOS.md`
- Release history: `CHANGELOG.md`
- Database schema: `Docs/habit_tracker_schema.md`
- UI architecture: `Docs/habit_tracker_ui_architecture.md`
- Legacy Claude context preserved during migration: `Docs/archive/CLAUDE.pre-codex-migration.md`

Do not append session diaries or completed release notes to this file. Put them in `CHANGELOG.md` or the relevant document.

## Working Agreements

- Inspect existing code and nearby conventions before editing.
- Keep changes scoped; do not modify or revert unrelated dirty-worktree changes.
- Use `rg` for text and file searches when the knowledge graph does not answer the question.
- Use `code-review-graph` before file scanning for exploration, impact analysis, and reviews when its MCP server is available. Fall back cleanly when unavailable.
- Prefer structured parsers for JSON, TOML, YAML, and other structured data.
- Use `apply_patch` for focused manual edits.
- Do not add secrets, credentials, OAuth files, signing keys, or machine-local paths to tracked configuration.
- Ask before destructive cleanup. User-requested installation or removal may proceed through the relevant package/plugin manager.
- Spawn subagents only when the user explicitly requests subagents, delegation, or parallel agent work.

## Delivery Process

Implementation work follows these project skills in order:

1. `check-plan`: validate the implementation plan or active plan artifact.
2. Implement the scoped change.
3. `check-code`: review, fix, and optimize until clean.
4. `review`: perform the final correctness, security, regression, and coverage pass.
5. `close`: update durable project documentation only when behavior or decisions changed.
6. `ship`: run final verification and prepare the commit when the user asks to ship.

Do not create a commit unless the user requests shipping or committing. Never stage unrelated changes.

## Verification

- Match verification depth to risk and blast radius.
- Never claim a command, test, build, emulator flow, or screenshot passed unless it was actually run.
- For UI changes, visually verify the live component on the Android emulator before declaring success.
- Report skipped checks and residual risk clearly.

## Claude Compatibility

`AGENTS.md` is the shared instruction source of truth. Root `CLAUDE.md` imports this file as a thin Claude adapter. Keep tool-specific settings in `.codex/` and `.claude/`; keep shared knowledge in normal project docs.
