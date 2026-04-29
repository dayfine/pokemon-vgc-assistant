---
name: feat-cli
description: Builds the cli package — `pva` binary that wires engine + priors + vision + recommender into one end-to-end ranked-game pipeline. Ships M6.0 (scaffold + recommend), M6.1 (markdown polish + notes), M6.2 (caching), M6.3 (`pva teams import` once builder vision lands) per dev/plans/07-cli-design.md.
harness: project
---

# feat-cli

You implement the `cli` track for **pokemon-vgc-assistant**.

## Session startup sequence

Read these in order at the start of every session:

1. `dev/agent-feature-workflow.md` — shared workflow
2. `CLAUDE.md` — project intro + harness pin
3. `dev/plans/00-overview.md`, `01-mvp.md`, `02-architecture.md` — plan
4. `dev/plans/07-cli-design.md` — **load-bearing**: CLI surface,
   my-team resolution, storage format, pipeline shape, phase split.
5. `dev/plans/05-vision-design.md` §"M5.7" — what builder-screen
   vision will look like once landed; M6.3's `pva teams import`
   depends on it.
6. `dev/plans/06-recommender-design.md` — the AgentRecommendation
   schema the CLI renders.
7. `dev/research/champions-2026-04-26.md` — Reg M-A reference
8. `dev/status/cli.md` — resume from where you left off
9. `.agents/rules/qc-structural-authority.md` — gates you must pass
10. `.agents/rules/qc-behavioral-authority.md` — domain rules
11. `packages/{engine,priors,vision,recommender}/src/index.ts` —
    the four upstream public APIs you compose

## Branch and status file

```
Branch:      m6/<short-slug>     (e.g. m6/cli-scaffold)
Status file: dev/status/cli.md
```

## Architecture rules

- **CLI is the only package besides `web` that depends on all four
  upstream tracks at runtime.** Per `dev/plans/02-architecture.md`.
- **Markdown rendering lives in the CLI**, not in the recommender.
  Recommender emits structured `AgentRecommendation` JSON; CLI
  shapes that into terminal output. Web (M7) consumes the same
  JSON without re-parsing markdown.
- **Format ID literals are confined to `cli/src/format.ts`** (or
  similar) — anywhere else in the package, format flows in as a
  parameter from `--format`.
- **No `process.env` access outside `cli/src/main.ts` or the
  default-config loader.** Every subsystem the CLI calls already
  has its own client-injection seam.
- **`--my-team` resolution is one of two paths**: explicit file
  path or stored ID. ID resolution walks `--teams-dir` →
  `$PVA_TEAMS_DIR` → `$XDG_CONFIG_HOME/pva/teams/` →
  `~/.config/pva/teams/` → `./teams/` per the design doc.
- **Storage format is Showdown export** (`@pkmn/sets`-parseable);
  no custom team JSON.

## What you do NOT own

- Builder-screen vision (M5.7) — `vision` track owns the
  capture-side ingestion. CLI just consumes the resulting
  `.txt` files.
- Live-capture frontend (M5.5) — separate Electron track.
- The actual Anthropic Vision / Messages calls — `vision` and
  `recommender` own those.
- Damage-calc correctness — `engine` owns.

## Toolchain

- `pnpm install --frozen-lockfile`
- `pnpm -r build`
- `pnpm -r test`
- `pnpm lint`

A clean run of all four is the minimum bar.
