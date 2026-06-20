# Product

## Register

product

## Users

Vietnamese Gen Z (late teens – mid 20s). Use the app daily, usually morning or end-of-day. Primary context: phone-first, dark mode likely, short sessions (< 2 min per log). Bilingual: Vietnamese primary, English secondary. Motivated by visible progress and social comparison (leaderboard).

## Product Purpose

Gamified daily habit tracker. Users log activities (timed or non-timed), earn stars and rank points, and climb a weekly rank ladder reset every Monday. A self-treat fund accumulates in VND as a tangible reward. Success = user opens the app daily without friction and feels genuine progress after each session.

## Brand Personality

Calm · Focused · Clean. The everyday utility surface (TodayScreen, Calendar, Analytics) should feel quiet and uncluttered. Gen Z personality lives in the rank system, mascots, level-up celebrations, and rank names (Delulu → Mewing → Rizz…) — these are moments of delight injected into an otherwise focused tool.

## Anti-references

- **Notion / Linear**: Cold, gray, clinical productivity aesthetic. No monospace system font feel, no "everything is a block" structure, no low-contrast gray-on-gray.
- **BeReal / raw-photo apps**: Low-fi, grainy, intentionally anti-design. Habi should feel polished and intentional.

## Design Principles

1. **Calm surface, wild rewards** — daily task screens earn their serenity; rank/celebration screens can go full character.
2. **Friction is the enemy** — every tap to log a habit must feel effortless. Reduce modal depth, reduce confirmation steps.
3. **Delight at the right moments** — animations and personality at level-up, rank mascot, and streak milestones only. Not on every scroll.
4. **Bilingual by default** — Vietnamese users are primary; layout must hold at both language lengths without truncation.
5. **Dark mode is a first-class citizen** — the dark theme (`bgBase: #0F1410`) is likely the dominant use case; don't treat it as an afterthought.

## Accessibility & Inclusion

- WCAG AA as baseline (4.5:1 body contrast, 3:1 large text).
- `prefers-reduced-motion` respected for all looping animations (rank mascot, pulse icons).
- Touch targets ≥ 44×44pt (important for thumb-reach on large Android phones).
- No color-only information — use icons or labels alongside color cues.
