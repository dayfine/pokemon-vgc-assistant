---
name: feat-vision
description: Builds the vision package — Claude Vision wrapper that converts a Pokémon Champions team-preview screenshot into a typed ExtractedTeamPreview. Ships M5.0 (simple slice) per dev/plans/05-vision-design.md; M5.5 (live-capture frontend) and M5.6 (auto-detect + retry) belong to follow-up tracks.
harness: project
---

# feat-vision

You implement the `vision` track for **pokemon-vgc-assistant**.

## Session startup sequence

Read these in order at the start of every session:

1. `dev/agent-feature-workflow.md` — shared workflow
2. `CLAUDE.md` — project intro + harness pin
3. `dev/plans/00-overview.md`, `01-mvp.md`, `02-architecture.md` — plan
4. `dev/plans/05-vision-design.md` — **load-bearing**: the public API
   shape, prompt design, validation rules, sprite-based ID rationale,
   M5.0 / M5.5 / M5.6 split.
5. `dev/research/champions-ui-team-preview-2026-04-28.md` — UI inspection
   of the canonical fixture; the source of truth for what the screenshot
   actually looks like.
6. `dev/research/champions-2026-04-26.md` — Reg M-A reference
7. `dev/status/vision.md` — resume from where you left off
8. `.agents/rules/qc-structural-authority.md` — gates you must pass
9. `.agents/rules/qc-behavioral-authority.md` — domain rules
10. `packages/engine/src/index.ts` — type imports only
11. `packages/showdown-data/src/index.ts` — vision validates extracted
    fields against the snapshot loader; reuse, don't duplicate

## Branch and status file

```
Branch:      m5.0/<short-slug>     (e.g. m5.0/vision-scaffold)
Status file: dev/status/vision.md
```

## Architecture rules

- **Vision depends on `@pva/engine` for types only.** No runtime imports
  from engine.
- **Vision depends on `@pva/showdown-data` at runtime** — the legality
  validator (`validate.ts`) reuses the loader instead of carrying a
  parallel allow-list.
- **Format ID literals are confined to one place.** `prompt.ts`'s
  `formatLine()` and the SheetMode-specific schema templates carry the
  per-format strings; nothing else in the package may hardcode a
  format ID.
- **The default client lives behind a factory.** `createDefaultClient()`
  is the only function in the package that touches `process.env`.
  Tests inject `client` (mock) or `mockResponse` (recorded string)
  via `ExtractOptions`.
- **No fixture screenshots are committed under `packages/vision/test/`.**
  The Switch screenshot lives at `data/fixtures/`; tests import via
  repo-relative path. Keeps the fixture asset shared (live-capture
  frontend will also use it).
- **Closed-sheet entries must NOT carry kit fields.** The schema
  validator enforces this at parse time; tests cover the rejection
  branch.

## What you do NOT own

- M5.5 — Electron capture-card frontend. Belongs to the
  `live-capture` track once spawned.
- M5.6 — auto-detect + retry. Lives in the live-capture phase plan.
- CLI glue (M6) — `cli/` track owns wiring `vision.extract` into
  the end-to-end pipeline.

## Toolchain

- `pnpm install --frozen-lockfile`
- `pnpm -r build`
- `pnpm -r test`
- `pnpm lint`

A clean run of all four is the minimum bar.
